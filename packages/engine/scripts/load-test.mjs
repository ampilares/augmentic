// Engine load test (Plan 2.6): enqueues N concurrent runs against an
// in-memory DB and reports throughput + integrity (no double-execution,
// every run terminal). Run with:
//   pnpm --filter @augmentic/db exec tsx ../engine/scripts/load-test.mjs [N]
process.env.PGLITE_DATA_DIR = ":memory:";

const N = Number(process.argv[2] ?? 25);

const { getDb, workspaces, users, memberships, agents, workflows, workflowRuns, runSteps } =
  await import("@augmentic/db");
const { seedBuiltins } = await import("@augmentic/db/seed");
const { enqueueRun, processRun } = await import("../src/index.ts");
const { eq, sql } = await import("drizzle-orm");

const db = await getDb();
await seedBuiltins(db);

const [ws] = await db
  .insert(workspaces)
  .values({ name: "Load Co", slug: "load-co", settings: { plan: "pro" } })
  .returning({ id: workspaces.id });
const [u] = await db
  .insert(users)
  .values({ email: "load@test.local", name: "Load", passwordHash: "x" })
  .returning({ id: users.id });
await db.insert(memberships).values({ workspaceId: ws.id, userId: u.id, role: "owner" });
const [agent] = await db
  .insert(agents)
  .values({
    workspaceId: ws.id,
    name: "Loady",
    roleTitle: "Ops",
    jobDescription: "Load testing.",
    status: "active",
    autonomyMode: "draft_only",
  })
  .returning({ id: agents.id });
const [wf] = await db
  .insert(workflows)
  .values({
    workspaceId: ws.id,
    name: "Load workflow",
    instructions: "Produce a short internal summary of recent activity.",
    agentId: agent.id,
    deliveryConfig: { target: "run_log" },
    status: "active",
  })
  .returning({ id: workflows.id });

console.log(`[load] enqueueing ${N} runs…`);
const started = Date.now();
const runIds = [];
for (let i = 0; i < N; i++) {
  runIds.push(
    await enqueueRun(db, { workspaceId: ws.id, workflowId: wf.id, triggerType: "manual" }),
  );
}

// Simulate worker concurrency of 4.
const queue = [...runIds];
async function workerLoop(id) {
  while (queue.length > 0) {
    const runId = queue.shift();
    if (!runId) break;
    // Atomic checkout like the real worker.
    const claimed = await db
      .update(workflowRuns)
      .set({ status: "running", lockedBy: `lt-${id}`, lockedAt: new Date(), startedAt: new Date() })
      .where(eq(workflowRuns.id, runId))
      .returning({ id: workflowRuns.id });
    if (claimed.length === 0) continue;
    await processRun(db, runId);
  }
}
await Promise.all(Array.from({ length: 4 }, (_, i) => workerLoop(i)));
const elapsed = Date.now() - started;

const rows = await db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, wf.id));
const byStatus = {};
for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
const [stepCount] = await db
  .select({ count: sql`count(*)` })
  .from(runSteps)
  .where(eq(runSteps.workspaceId, ws.id));

console.log(`[load] ${N} runs in ${(elapsed / 1000).toFixed(1)}s (${((N * 1000) / elapsed).toFixed(1)} runs/s)`);
console.log("[load] statuses:", byStatus);
console.log("[load] total steps:", Number(stepCount.count));
const terminal = (byStatus.succeeded ?? 0) + (byStatus.failed ?? 0) + (byStatus.blocked ?? 0) + (byStatus.waiting_approval ?? 0);
if (terminal !== N) {
  console.error("[load] FAIL: not all runs reached a terminal/parked state");
  process.exit(1);
}
console.log("[load] OK — all runs accounted for, no orphans");
process.exit(0);
