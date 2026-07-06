import {
  integrationConnections,
  workflowRuns,
  workflows,
  workflowTriggers,
  type Db,
} from "@augmentic/db";
import { and, eq, isNotNull, lt, lte, sql } from "drizzle-orm";
import { Cron } from "croner";
import crypto from "node:crypto";
import { executeTool } from "@augmentic/connectors";
import { enqueueRun } from "./enqueue";
import { processRun } from "./pipeline";

const WORKER_ID = `worker-${crypto.randomBytes(4).toString("hex")}`;
const ORPHAN_TIMEOUT_MS = 60_000;
const MAX_CONCURRENT = 2;

let started = false;
let inFlight = 0;

// DB-backed heartbeat worker (Paperclip pattern): atomic checkout, orphan
// recovery, schedule firing. State lives entirely in Postgres so the engine
// can be swapped for Inngest/Temporal without touching run data (Spec §3.2).
export function startEngine(db: Db): void {
  if (started) return;
  started = true;
  let lastAppEventPoll = 0;
  let lastCheckpoint = 0;
  const tick = async () => {
    try {
      await reapOrphans(db);
      await fireDueSchedules(db);
      if (Date.now() - lastAppEventPoll > 60_000) {
        lastAppEventPoll = Date.now();
        await pollAppEvents(db);
      }
      if (Date.now() - lastCheckpoint > 15_000) {
        lastCheckpoint = Date.now();
        // Embedded PGlite: force WAL flush so a hard-killed dev process
        // (Next.js restart) can't lose recent commits.
        try {
          await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute?.(
            sql`CHECKPOINT`,
          );
        } catch {
          /* non-fatal */
        }
      }
      while (inFlight < MAX_CONCURRENT) {
        const runId = await checkoutRun(db);
        if (!runId) break;
        inFlight += 1;
        void processRun(db, runId).finally(() => {
          inFlight -= 1;
        });
      }
    } catch (err) {
      console.error("[engine] tick error", err);
    }
  };
  setInterval(tick, 2000);
  void tick();
  console.log(`[engine] started as ${WORKER_ID}`);
}

// Atomic checkout: flip exactly one queued run to running with our lock. The
// WHERE clause re-checks status so two workers can never both win (verified
// by the returned row count).
async function checkoutRun(db: Db): Promise<string | null> {
  const candidates = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.status, "queued"))
    .orderBy(workflowRuns.createdAt)
    .limit(1);
  const candidate = candidates[0];
  if (!candidate) return null;
  const updated = await db
    .update(workflowRuns)
    .set({
      status: "running",
      lockedBy: WORKER_ID,
      lockedAt: new Date(),
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(workflowRuns.id, candidate.id), eq(workflowRuns.status, "queued")))
    .returning({ id: workflowRuns.id });
  return updated[0]?.id ?? null;
}

// Orphaned-run reaper: reclaim runs whose worker died mid-pipeline. Their
// resume_state lets the pipeline continue from the last persisted phase.
async function reapOrphans(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - ORPHAN_TIMEOUT_MS);
  const orphans = await db
    .select({ id: workflowRuns.id, attempts: workflowRuns.attempts })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.status, "running"),
        isNotNull(workflowRuns.lockedAt),
        lt(workflowRuns.lockedAt, cutoff),
      ),
    );
  for (const orphan of orphans) {
    if (orphan.attempts >= 3) {
      await db
        .update(workflowRuns)
        .set({
          status: "failed",
          statusReason: "Worker died repeatedly; giving up after 3 attempts.",
          lockedBy: null,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, orphan.id));
    } else {
      await db
        .update(workflowRuns)
        .set({
          status: "queued",
          lockedBy: null,
          lockedAt: null,
          attempts: orphan.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, orphan.id));
    }
  }
}

export function computeNextFire(cron: string, timezone: string): Date | null {
  try {
    const job = new Cron(cron, { timezone });
    return job.nextRun();
  } catch {
    return null;
  }
}

async function fireDueSchedules(db: Db): Promise<void> {
  const now = new Date();
  const due = await db
    .select()
    .from(workflowTriggers)
    .where(
      and(
        eq(workflowTriggers.triggerType, "schedule"),
        eq(workflowTriggers.enabled, true),
        isNotNull(workflowTriggers.nextFireAt),
        lte(workflowTriggers.nextFireAt, now),
      ),
    );
  for (const trigger of due) {
    const config = trigger.config as { schedule?: { cron?: string; timezone?: string } };
    const cron = config.schedule?.cron;
    const tz = config.schedule?.timezone ?? "UTC";
    const next = cron ? computeNextFire(cron, tz) : null;
    // Advance nextFireAt first (coalescing): a slow tick fires once, not N times.
    const claimed = await db
      .update(workflowTriggers)
      .set({ nextFireAt: next, lastFiredAt: now, updatedAt: now })
      .where(
        and(
          eq(workflowTriggers.id, trigger.id),
          isNotNull(workflowTriggers.nextFireAt),
          lte(workflowTriggers.nextFireAt, now),
        ),
      )
      .returning({ id: workflowTriggers.id });
    if (claimed.length === 0) continue;
    await enqueueRun(db, {
      workspaceId: trigger.workspaceId,
      workflowId: trigger.workflowId,
      triggerType: "schedule",
      triggerSnapshot: { firedAt: now.toISOString(), cron },
    });
  }
}

// App-event trigger (FR-013, one provider e2e): polls Gmail for messages
// newer than the last firing that match the configured filter.
async function pollAppEvents(db: Db): Promise<void> {
  const triggers = await db
    .select()
    .from(workflowTriggers)
    .where(
      and(
        eq(workflowTriggers.triggerType, "app_event"),
        eq(workflowTriggers.enabled, true),
      ),
    );
  for (const trigger of triggers) {
    const [wf] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, trigger.workflowId));
    if (!wf || wf.status !== "active") continue;
    const [conn] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.workspaceId, trigger.workspaceId),
          eq(integrationConnections.provider, "google"),
        ),
      );
    if (!conn) continue;
    const config = trigger.config as { filter?: string };
    const query = `newer_than:1d ${config.filter ?? ""}`.trim();
    try {
      const result = (await executeTool(
        "gmail.search_messages",
        { query, maxResults: 10 },
        {
          workspaceId: trigger.workspaceId,
          connection: {
            id: conn.id,
            provider: conn.provider,
            isDemo: conn.isDemo,
            accountLabel: conn.accountLabel,
          },
          mode: "live",
        },
      )) as { messages?: { id: string; date: string; subject: string }[] };
      const since = trigger.lastFiredAt ?? new Date(Date.now() - 86_400_000);
      const fresh = (result.messages ?? []).filter(
        (m) => new Date(m.date) > since,
      );
      if (fresh.length === 0) continue;
      await db
        .update(workflowTriggers)
        .set({ lastFiredAt: new Date(), updatedAt: new Date() })
        .where(eq(workflowTriggers.id, trigger.id));
      await enqueueRun(db, {
        workspaceId: trigger.workspaceId,
        workflowId: trigger.workflowId,
        triggerType: "app_event",
        triggerSnapshot: {
          payload: { provider: "gmail", event: "new_message", messages: fresh },
        },
      });
    } catch (err) {
      console.error("[engine] app-event poll failed", err);
    }
  }
}
