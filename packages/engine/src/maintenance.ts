import {
  approvalRequests,
  notifications,
  usageLedgerEntries,
  workflowRuns,
  workspaces,
  type Db,
} from "@augmentic/db";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { notifyWorkspace } from "./notifications";
import { recordAudit } from "./audit";

const TERMINAL: ("succeeded" | "failed" | "cancelled" | "blocked")[] = [
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
];

// Data-retention execution (Plan 3.3 / PRD open question #8): per-workspace
// purge of old terminal run data. Cascades remove run steps, tool calls,
// approval requests, and artifacts. The audit log is append-only and exempt.
export async function purgeExpiredData(db: Db): Promise<void> {
  const rows = await db
    .select({ id: workspaces.id, settings: workspaces.settings })
    .from(workspaces);
  for (const ws of rows) {
    const retentionDays = (ws.settings as { retentionDays?: number })?.retentionDays;
    if (!retentionDays || retentionDays < 7) continue;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const oldRuns = await db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, ws.id),
          inArray(workflowRuns.status, TERMINAL),
          lt(workflowRuns.createdAt, cutoff),
        ),
      );
    if (oldRuns.length > 0) {
      await db.delete(workflowRuns).where(
        inArray(
          workflowRuns.id,
          oldRuns.map((r) => r.id),
        ),
      );
      await recordAudit(db, {
        workspaceId: ws.id,
        actorType: "system",
        actorLabel: "retention",
        eventType: "retention.purged",
        payload: { runsDeleted: oldRuns.length, retentionDays },
      });
    }
    await db
      .delete(notifications)
      .where(and(eq(notifications.workspaceId, ws.id), lt(notifications.createdAt, cutoff)));
  }
}

// Weekly value-summary notification (FR-021). Emitted at most once per 7
// days per workspace with activity.
export async function emitWeeklySummaries(db: Db): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  for (const ws of rows) {
    const [recentSummary] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, ws.id),
          eq(notifications.kind, "weekly_summary"),
          gte(notifications.createdAt, weekAgo),
        ),
      )
      .limit(1);
    if (recentSummary) continue;

    const [runStats] = await db
      .select({
        completed: sql<number>`count(*) filter (where ${workflowRuns.status} = 'succeeded' and ${workflowRuns.mode} = 'live')`,
        total: sql<number>`count(*) filter (where ${workflowRuns.mode} = 'live')`,
      })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workspaceId, ws.id), gte(workflowRuns.createdAt, weekAgo)));
    const completed = Number(runStats?.completed ?? 0);
    if (completed === 0) continue; // no activity, no noise

    const [approvalStats] = await db
      .select({ decided: sql<number>`count(*) filter (where ${approvalRequests.status} != 'pending')` })
      .from(approvalRequests)
      .where(
        and(eq(approvalRequests.workspaceId, ws.id), gte(approvalRequests.createdAt, weekAgo)),
      );
    const [costRow] = await db
      .select({ cost: sql<number>`coalesce(sum(${usageLedgerEntries.costCents}), 0)` })
      .from(usageLedgerEntries)
      .where(
        and(
          eq(usageLedgerEntries.workspaceId, ws.id),
          gte(usageLedgerEntries.createdAt, weekAgo),
        ),
      );

    await notifyWorkspace(db, {
      workspaceId: ws.id,
      kind: "weekly_summary",
      title: "Your AI team's week",
      body: `${completed} work item${completed === 1 ? "" : "s"} completed, ${Number(approvalStats?.decided ?? 0)} approvals decided, $${(Number(costRow?.cost ?? 0) / 100).toFixed(2)} AI spend. Full breakdown on the ROI page.`,
      href: "/roi",
    });
  }
}
