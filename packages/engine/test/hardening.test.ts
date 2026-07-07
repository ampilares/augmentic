import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agents,
  auditEvents,
  integrationConnections,
  memberships,
  notifications,
  toolCalls,
  toolDefinitions,
  toolPermissionPolicies,
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
import { purgeExpiredData } from "../src/retention";

process.env.PGLITE_DATA_DIR = ":memory:";

let db: Db;
let wsId: string;
let agentId: string;

beforeAll(async () => {
  db = await getDb();
  await seedBuiltins(db);
  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Hardening Co", slug: "hardening", settings: { plan: "pro" } })
    .returning({ id: workspaces.id });
  wsId = ws!.id;
  const [u] = await db
    .insert(users)
    .values({ email: "owner@hardening.test", name: "Owner", passwordHash: "x" })
    .returning({ id: users.id });
  await db.insert(memberships).values({ workspaceId: wsId, userId: u!.id, role: "owner" });
  const [agent] = await db
    .insert(agents)
    .values({
      workspaceId: wsId,
      name: "Hardy",
      roleTitle: "EA",
      jobDescription: "Summarize and post digests.",
      status: "active",
      autonomyMode: "autonomous_low_risk",
    })
    .returning({ id: agents.id });
  agentId = agent!.id;
  for (const provider of ["google", "slack"]) {
    await db.insert(integrationConnections).values({
      workspaceId: wsId,
      provider,
      accountLabel: `Demo ${provider}`,
      isDemo: true,
      healthStatus: "connected",
    });
  }
}, 60_000);

describe("red team: policy is enforced outside the model", () => {
  it("an explicitly denied tool never executes even when instructions demand it", async () => {
    const [toolDef] = await db
      .select()
      .from(toolDefinitions)
      .where(eq(toolDefinitions.name, "slack.post_message"));
    expect(toolDef).toBeDefined();
    await db.insert(toolPermissionPolicies).values({
      workspaceId: wsId,
      agentId,
      toolDefinitionId: toolDef!.id,
      setting: "deny",
    });

    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsId,
        name: "Post digest to Slack",
        instructions:
          "Summarize the inbox and post the digest to the #general Slack channel immediately.",
        agentId,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsId,
      workflowId: wf!.id,
      triggerType: "manual",
    });
    await processRun(db, runId);

    const calls = await db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.workflowRunId, runId));
    const executedSlack = calls.filter(
      (c) => c.toolName === "slack.post_message" && c.executedAt,
    );
    expect(executedSlack.length).toBe(0);

    // Clean up the deny row so later tests see default policy.
    await db
      .delete(toolPermissionPolicies)
      .where(
        and(
          eq(toolPermissionPolicies.agentId, agentId),
          eq(toolPermissionPolicies.toolDefinitionId, toolDef!.id),
        ),
      );
  });
});

describe("data retention", () => {
  it("purges old terminal runs and notifications but never parked work", async () => {
    await db
      .update(workspaces)
      .set({ settings: { plan: "pro", retentionDays: 30 } })
      .where(eq(workspaces.id, wsId));

    const old = new Date(Date.now() - 60 * 86_400_000);
    const [oldDone] = await db
      .insert(workflowRuns)
      .values({
        workspaceId: wsId,
        agentId,
        mode: "live",
        triggerType: "manual",
        status: "succeeded",
        createdAt: old,
      })
      .returning({ id: workflowRuns.id });
    const [oldParked] = await db
      .insert(workflowRuns)
      .values({
        workspaceId: wsId,
        agentId,
        mode: "live",
        triggerType: "manual",
        status: "waiting_approval",
        createdAt: old,
      })
      .returning({ id: workflowRuns.id });
    const [freshDone] = await db
      .insert(workflowRuns)
      .values({
        workspaceId: wsId,
        agentId,
        mode: "live",
        triggerType: "manual",
        status: "succeeded",
      })
      .returning({ id: workflowRuns.id });
    await db.insert(notifications).values({
      workspaceId: wsId,
      kind: "run_failed",
      title: "old notification",
      createdAt: old,
    });

    const results = await purgeExpiredData(db);
    expect(results.get(wsId)?.runsDeleted).toBeGreaterThanOrEqual(1);

    const remaining = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(eq(workflowRuns.workspaceId, wsId));
    const ids = remaining.map((r) => r.id);
    expect(ids).not.toContain(oldDone!.id); // old terminal: purged
    expect(ids).toContain(oldParked!.id); // parked: kept regardless of age
    expect(ids).toContain(freshDone!.id); // fresh: kept

    const oldNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.workspaceId, wsId), eq(notifications.title, "old notification")),
      );
    expect(oldNotifications.length).toBe(0);

    // The purge itself is audited.
    const [auditRow] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, wsId),
          eq(auditEvents.eventType, "retention.purged"),
        ),
      );
    expect(auditRow).toBeDefined();
  });

  it("audit retention is governed separately and leaves audit intact when unset", async () => {
    await db
      .update(workspaces)
      .set({ settings: { plan: "pro", retentionDays: 30 } })
      .where(eq(workspaces.id, wsId));
    const old = new Date(Date.now() - 400 * 86_400_000);
    await db.insert(auditEvents).values({
      workspaceId: wsId,
      actorType: "system",
      actorLabel: "test",
      eventType: "test.old_event",
      createdAt: old,
    });
    await purgeExpiredData(db);
    let rows = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.workspaceId, wsId), eq(auditEvents.eventType, "test.old_event")),
      );
    expect(rows.length).toBe(1); // auditRetentionDays unset → kept

    await db
      .update(workspaces)
      .set({ settings: { plan: "pro", auditRetentionDays: 365 } })
      .where(eq(workspaces.id, wsId));
    await purgeExpiredData(db);
    rows = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.workspaceId, wsId), eq(auditEvents.eventType, "test.old_event")),
      );
    expect(rows.length).toBe(0);
  });
});

describe("client-safe approval links (FR-024)", () => {
  it("external decision resumes the run and is audited as external actor", async () => {
    const { approvalLinks, approvalRequests, workflows } = await import("@augmentic/db");
    const { decideApproval } = await import("../src/approvals");
    const crypto = await import("node:crypto");

    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: wsId,
        name: "Client-approved chaser",
        instructions: "Find overdue invoices and send the reminder to the client.",
        agentId,
        deliveryConfig: { target: "run_log" },
        status: "ready",
      })
      .returning({ id: workflows.id });
    const runId = await enqueueRun(db, {
      workspaceId: wsId,
      workflowId: wf!.id,
      triggerType: "manual",
    });
    await processRun(db, runId);
    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workflowRunId, runId),
          eq(approvalRequests.status, "pending"),
        ),
      );
    expect(approval).toBeDefined();

    // Create a client link the way the action does, then decide externally.
    await db.insert(approvalLinks).values({
      workspaceId: wsId,
      approvalRequestId: approval!.id,
      token: crypto.randomBytes(24).toString("base64url"),
      recipientLabel: "client@acme.example",
      createdByUserId: (
        await db.select({ id: users.id }).from(users).where(eq(users.email, "owner@hardening.test"))
      )[0]!.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });

    await decideApproval(db, {
      workspaceId: wsId,
      approvalRequestId: approval!.id,
      action: "approve",
      decidedByUserId: null,
      decidedByLabel: "client@acme.example (client link)",
      actorType: "external",
    });

    const [decided] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approval!.id));
    expect(decided!.status).toBe("approved");
    expect(decided!.decidedByUserId).toBeNull();

    // Run resumes and executes the approved send.
    await processRun(db, runId);
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(["succeeded", "waiting_approval"]).toContain(run!.status);

    const [auditRow] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, wsId),
          eq(auditEvents.eventType, "approval.approved"),
          eq(auditEvents.actorType, "external"),
        ),
      );
    expect(auditRow).toBeDefined();
    expect(auditRow!.actorLabel).toContain("client@acme.example");
  });
});
