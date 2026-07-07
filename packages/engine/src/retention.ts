import {
  auditEvents,
  notifications,
  workflowRuns,
  workspaces,
  type Db,
} from "@augmentic/db";
import { and, eq, inArray, lt } from "drizzle-orm";
import { recordAudit } from "./audit";

// Per-workspace data retention (plan 2.6 / PRD open question #8).
// workspace.settings.retentionDays — terminal runs (with their steps, tool
// calls, approvals, and artifacts via FK cascade) and notifications older
// than the window are purged. Audit events are governed separately by
// settings.auditRetentionDays because most compliance postures want audit
// kept longer than operational data. Unset = keep forever.

const TERMINAL_STATUSES = ["succeeded", "failed", "cancelled", "blocked"] as const;

export interface PurgeResult {
  runsDeleted: number;
  notificationsDeleted: number;
  auditEventsDeleted: number;
}

export async function purgeExpiredData(db: Db): Promise<Map<string, PurgeResult>> {
  const results = new Map<string, PurgeResult>();
  const wsRows = await db
    .select({ id: workspaces.id, settings: workspaces.settings })
    .from(workspaces);
  for (const ws of wsRows) {
    const settings = (ws.settings ?? {}) as {
      retentionDays?: number;
      auditRetentionDays?: number;
    };
    const result: PurgeResult = {
      runsDeleted: 0,
      notificationsDeleted: 0,
      auditEventsDeleted: 0,
    };

    if (settings.retentionDays && settings.retentionDays > 0) {
      const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
      // Only terminal runs age out; parked work (waiting_approval, queued,
      // running) is never deleted regardless of age.
      const deletedRuns = await db
        .delete(workflowRuns)
        .where(
          and(
            eq(workflowRuns.workspaceId, ws.id),
            inArray(workflowRuns.status, TERMINAL_STATUSES as unknown as string[] as never),
            lt(workflowRuns.createdAt, cutoff),
          ),
        )
        .returning({ id: workflowRuns.id });
      result.runsDeleted = deletedRuns.length;

      const deletedNotifications = await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.workspaceId, ws.id),
            lt(notifications.createdAt, cutoff),
          ),
        )
        .returning({ id: notifications.id });
      result.notificationsDeleted = deletedNotifications.length;
    }

    if (settings.auditRetentionDays && settings.auditRetentionDays > 0) {
      const cutoff = new Date(Date.now() - settings.auditRetentionDays * 86_400_000);
      const deletedAudit = await db
        .delete(auditEvents)
        .where(
          and(eq(auditEvents.workspaceId, ws.id), lt(auditEvents.createdAt, cutoff)),
        )
        .returning({ id: auditEvents.id });
      result.auditEventsDeleted = deletedAudit.length;
    }

    if (
      result.runsDeleted + result.notificationsDeleted + result.auditEventsDeleted >
      0
    ) {
      // The purge itself is audited (after the audit purge, so this record
      // survives until the next window).
      await recordAudit(db, {
        workspaceId: ws.id,
        actorType: "system",
        actorLabel: "retention",
        eventType: "retention.purged",
        payload: { ...result, retentionDays: settings.retentionDays ?? null },
      });
      results.set(ws.id, result);
    }
  }
  return results;
}
