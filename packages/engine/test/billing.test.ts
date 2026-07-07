import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agents,
  users,
  memberships,
  workflowRuns,
  workflows,
  workspaces,
  getDb,
  type Db,
} from "@augmentic/db";
import { seedBuiltins } from "@augmentic/db/seed";
import { enqueueRun, requeueBlockedRun } from "../src/enqueue";
import { checkAgentQuota, checkRunQuota } from "../src/billing";

process.env.PGLITE_DATA_DIR = ":memory:";

let db: Db;
let wsId: string;
let agentId: string;
let workflowId: string;

beforeAll(async () => {
  db = await getDb();
  await seedBuiltins(db);
  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Quota Co", slug: "quota", settings: { plan: "starter" } })
    .returning({ id: workspaces.id });
  wsId = ws!.id;
  const [u] = await db
    .insert(users)
    .values({ email: "owner@quota.test", name: "Owner", passwordHash: "x" })
    .returning({ id: users.id });
  await db.insert(memberships).values({ workspaceId: wsId, userId: u!.id, role: "owner" });
  const [agent] = await db
    .insert(agents)
    .values({
      workspaceId: wsId,
      name: "Solo",
      roleTitle: "EA",
      jobDescription: "x",
      status: "active",
      autonomyMode: "draft_only",
    })
    .returning({ id: agents.id });
  agentId = agent!.id;
  const [wf] = await db
    .insert(workflows)
    .values({
      workspaceId: wsId,
      name: "Digest",
      instructions: "Summarize things.",
      agentId,
      deliveryConfig: { target: "run_log" },
      status: "ready",
    })
    .returning({ id: workflows.id });
  workflowId = wf!.id;
}, 60_000);

describe("plan enforcement", () => {
  it("agent quota counts existing agents against the plan limit", async () => {
    // Starter allows 1 agent; the workspace already has one.
    const quota = await checkAgentQuota(db, wsId);
    expect(quota.limit).toBe(1);
    expect(quota.used).toBe(1);
    expect(quota.allowed).toBe(false);
  });

  it("parks over-quota live runs as blocked and requeues them after upgrade", async () => {
    // Exhaust the starter monthly run quota by inserting run rows directly
    // (cheaper than executing them); enqueueRun counts non-blocked live runs.
    const { PLANS } = await import("@augmentic/shared");
    const limit = PLANS.starter.monthlyRunLimit;
    const batch = Array.from({ length: limit }, () => ({
      workspaceId: wsId,
      workflowId,
      agentId,
      mode: "live" as const,
      triggerType: "manual" as const,
      status: "succeeded" as const,
    }));
    await db.insert(workflowRuns).values(batch);

    const before = await checkRunQuota(db, wsId);
    expect(before.allowed).toBe(false);

    const runId = await enqueueRun(db, {
      workspaceId: wsId,
      workflowId,
      triggerType: "schedule",
    });
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run!.status).toBe("blocked");
    expect(run!.statusReason).toMatch(/Monthly run limit/);

    // Still blocked while over quota.
    expect(await requeueBlockedRun(db, wsId, runId)).toBe(false);

    // Upgrade the plan → requeue succeeds and the run is queued again.
    await db
      .update(workspaces)
      .set({ settings: { plan: "growth" } })
      .where(eq(workspaces.id, wsId));
    expect(await requeueBlockedRun(db, wsId, runId)).toBe(true);
    const [requeued] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(requeued!.status).toBe("queued");
    expect(requeued!.statusReason).toBeNull();
  });

  it("simulation runs bypass the run quota", async () => {
    // Workspace is back under quota (growth plan) — drop it to starter with
    // the quota already exhausted from the previous test.
    await db
      .update(workspaces)
      .set({ settings: { plan: "starter" } })
      .where(eq(workspaces.id, wsId));
    const runId = await enqueueRun(db, {
      workspaceId: wsId,
      workflowId,
      mode: "simulation",
      triggerType: "manual",
    });
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(run!.status).toBe("queued");
  });
});
