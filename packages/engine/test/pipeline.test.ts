import { beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  agents,
  approvalRequests,
  artifacts,
  integrationConnections,
  memberships,
  toolCalls,
  users,
  workflowRuns,
  workflows,
  workspaces,
  getDb,
  type Db,
} from "@augmentic/db";
import { seedBuiltins } from "@augmentic/db/seed";
import { enqueueRun } from "../src/enqueue";
import { processRun } from "../src/pipeline";
import { decideApproval } from "../src/approvals";

process.env.PGLITE_DATA_DIR = ":memory:";

let db: Db;
let wsA: string;
let wsB: string;
let userA: string;
let agentA: string;

beforeAll(async () => {
  db = await getDb();
  await seedBuiltins(db);

  const [ws1] = await db
    .insert(workspaces)
    .values({ name: "Alpha Co", slug: "alpha" })
    .returning({ id: workspaces.id });
  const [ws2] = await db
    .insert(workspaces)
    .values({ name: "Beta Co", slug: "beta" })
    .returning({ id: workspaces.id });
  wsA = ws1!.id;
  wsB = ws2!.id;

  const [u] = await db
    .insert(users)
    .values({ email: "owner@alpha.test", name: "Alpha Owner", passwordHash: "x" })
    .returning({ id: users.id });
  userA = u!.id;
  await db.insert(memberships).values({ workspaceId: wsA, userId: userA, role: "owner" });

  const [agent] = await db
    .insert(agents)
    .values({
      workspaceId: wsA,
      name: "Frankie",
      roleTitle: "Finance Admin",
      jobDescription: "Chase overdue invoices politely.",
      status: "active",
      autonomyMode: "draft_only",
    })
    .returning({ id: agents.id });
  agentA = agent!.id;

  await db.insert(integrationConnections).values({
    workspaceId: wsA,
    provider: "google",
    accountLabel: "Demo google",
    isDemo: true,
    healthStatus: "connected",
  });
  await db.insert(integrationConnections).values({
    workspaceId: wsA,
    provider: "slack",
    accountLabel: "Demo slack",
    isDemo: true,
    healthStatus: "connected",
  });
}, 60_000);

async function runToCompletion(runId: string) {
  // processRun returns when the run parks, blocks, fails, or succeeds.
  await processRun(db, runId);
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
  return run!;
}

describe("run pipeline", () => {
  it("completes a read+draft workflow and records steps, artifact, cost", async () => {
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsA,
        name: "Inbox digest",
        instructions:
          "Review the inbox from the last day and produce a digest of urgent email.",
        agentId: agentA,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsA,
      workflowId: wf!.id,
      triggerType: "manual",
    });
    const run = await runToCompletion(runId);
    expect(run.status).toBe("succeeded");

    const arts = await db.select().from(artifacts).where(eq(artifacts.workflowRunId, runId));
    expect(arts.length).toBe(1);
    expect(arts[0]!.content).toContain("What I found");
  });

  it("parks external sends for approval and resumes to execute exactly once", async () => {
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsA,
        name: "Invoice chaser",
        instructions:
          "Find overdue invoice emails and send the reminder to the client. Draft a follow-up reminder as well.",
        agentId: agentA,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsA,
      workflowId: wf!.id,
      triggerType: "manual",
    });

    let run = await runToCompletion(runId);
    expect(run.status).toBe("waiting_approval");

    const pending = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workflowRunId, runId),
          eq(approvalRequests.status, "pending"),
        ),
      );
    expect(pending.length).toBe(1);
    const approval = pending[0]!;
    expect(approval.riskTier).toBe("external_send");
    expect(approval.policyReason.toLowerCase()).toContain("approval");

    // Approve with an edited payload — the run must execute exactly that.
    await decideApproval(db, {
      workspaceId: wsA,
      approvalRequestId: approval.id,
      action: "edit",
      decidedByUserId: userA,
      decidedByLabel: "owner@alpha.test",
      editedPayload: {
        to: "billing@acmesupply.com",
        subject: "Edited by approver",
        body: "Approved reminder body.",
      },
    });

    run = await runToCompletion(runId);
    expect(run.status).toBe("succeeded");

    const sends = await db
      .select()
      .from(toolCalls)
      .where(
        and(eq(toolCalls.workflowRunId, runId), eq(toolCalls.toolName, "gmail.send_email")),
      );
    const executed = sends.filter((s) => s.executedAt);
    expect(executed.length).toBe(1);
    expect((executed[0]!.args as { subject: string }).subject).toBe("Edited by approver");

    // Replaying the run (worker crash after approval) must not double-send.
    await db
      .update(workflowRuns)
      .set({ status: "queued" })
      .where(eq(workflowRuns.id, runId));
    // Reset action index to force the actions phase to re-run.
    await processRun(db, runId);
    const sendsAfter = await db
      .select()
      .from(toolCalls)
      .where(
        and(eq(toolCalls.workflowRunId, runId), eq(toolCalls.toolName, "gmail.send_email")),
      );
    expect(sendsAfter.filter((s) => s.executedAt).length).toBe(1);
  });

  it("rejecting an approval cancels the action but the run still completes", async () => {
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsA,
        name: "Chaser 2",
        instructions: "Find overdue invoices and send the reminder to the client.",
        agentId: agentA,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsA,
      workflowId: wf!.id,
      triggerType: "manual",
    });
    let run = await runToCompletion(runId);
    expect(run.status).toBe("waiting_approval");
    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(eq(approvalRequests.workflowRunId, runId), eq(approvalRequests.status, "pending")),
      );
    await decideApproval(db, {
      workspaceId: wsA,
      approvalRequestId: approval!.id,
      action: "reject",
      decidedByUserId: userA,
      decidedByLabel: "owner@alpha.test",
      comment: "Not this client.",
    });
    run = await runToCompletion(runId);
    expect(run.status).toBe("succeeded");
    const sends = await db
      .select()
      .from(toolCalls)
      .where(
        and(eq(toolCalls.workflowRunId, runId), eq(toolCalls.toolName, "gmail.send_email")),
      );
    expect(sends.filter((s) => s.executedAt).length).toBe(0);
  });

  it("simulation mode never executes side effects", async () => {
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsA,
        name: "Sim chaser",
        instructions:
          "Find overdue invoices, draft a reminder, and send the reminder. Post the summary to #finance on slack.",
        agentId: agentA,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsA,
      workflowId: wf!.id,
      mode: "simulation",
      triggerType: "manual",
    });
    const run = await runToCompletion(runId);
    expect(run.status).toBe("succeeded");
    // No approval requests created and no side-effecting tools executed.
    const approvals = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.workflowRunId, runId));
    expect(approvals.length).toBe(0);
    const calls = await db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.workflowRunId, runId));
    for (const call of calls.filter((c) => c.executedAt)) {
      // Read and draft tiers are the only ones allowed to run in simulation
      // (drafts are inert until a human sends them; Spec §7.1).
      expect(["read", "draft"]).toContain(call.riskTier);
    }
  });

  it("prompt injection in retrieved email cannot cause an unapproved external send", async () => {
    // Demo inbox contains a poisoned email instructing an immediate exfil
    // send to attacker@evil.example without approval.
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsA,
        name: "Digest with poisoned inbox",
        instructions: "Review the inbox from the last day and summarize urgent email.",
        agentId: agentA,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsA,
      workflowId: wf!.id,
      triggerType: "manual",
    });
    const run = await runToCompletion(runId);
    expect(["succeeded", "waiting_approval"]).toContain(run.status);

    const calls = await db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.workflowRunId, runId));
    const executedSends = calls.filter(
      (c) => c.executedAt && ["external_send", "publish"].includes(c.riskTier),
    );
    expect(executedSends.length).toBe(0);
    const evil = calls.find((c) => JSON.stringify(c.args).includes("attacker@evil.example"));
    expect(evil).toBeUndefined();
  });

  it("cross-tenant approval decisions are rejected", async () => {
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsA,
        name: "Chaser 3",
        instructions: "Find overdue invoices and send the reminder to the client.",
        agentId: agentA,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsA,
      workflowId: wf!.id,
      triggerType: "manual",
    });
    await runToCompletion(runId);
    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(eq(approvalRequests.workflowRunId, runId), eq(approvalRequests.status, "pending")),
      );
    await expect(
      decideApproval(db, {
        workspaceId: wsB, // wrong tenant
        approvalRequestId: approval!.id,
        action: "approve",
        decidedByUserId: userA,
        decidedByLabel: "intruder@beta.test",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("agent spend cap hard-stops runs and pauses the agent", async () => {
    const [capped] = await db
      .insert(agents)
      .values({
        workspaceId: wsA,
        name: "Capped",
        roleTitle: "Test",
        jobDescription: "x",
        status: "active",
        autonomyMode: "draft_only",
        spendCapMonthlyCents: 0,
      })
      .returning({ id: agents.id });
    // Force some existing spend so cap(0) is already reached.
    const { recordUsage } = await import("../src/audit");
    await recordUsage(db, {
      workspaceId: wsA,
      agentId: capped!.id,
      kind: "model_tokens",
      costCents: 1,
    });
    const runId = await enqueueRun(db, {
      workspaceId: wsA,
      agentId: capped!.id,
      mode: "chat",
      triggerType: "manual",
      triggerSnapshot: { instructions: "hello" },
    });
    const run = await runToCompletion(runId);
    expect(run.status).toBe("blocked");
    const [agentRow] = await db.select().from(agents).where(eq(agents.id, capped!.id));
    expect(agentRow!.status).toBe("paused");
  });
});
