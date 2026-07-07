import { workflowRuns, workflows, notifications, type Db } from "@augmentic/db";
import type { RunMode, TriggerType } from "@augmentic/shared";
import { and, eq, gte } from "drizzle-orm";
import { checkRunQuota } from "./billing";
import { notifyWorkspace } from "./notifications";

export interface EnqueueInput {
  workspaceId: string;
  workflowId?: string | null;
  agentId?: string;
  mode?: RunMode;
  triggerType: TriggerType;
  triggerSnapshot?: Record<string, unknown>;
  // Chat/ad-hoc runs carry their instructions in the snapshot.
}

export async function enqueueRun(db: Db, input: EnqueueInput): Promise<string> {
  let agentId = input.agentId;
  if (!agentId) {
    if (!input.workflowId) throw new Error("enqueueRun: agentId or workflowId required");
    const [wf] = await db
      .select({ agentId: workflows.agentId })
      .from(workflows)
      .where(eq(workflows.id, input.workflowId));
    if (!wf) throw new Error("enqueueRun: workflow not found");
    agentId = wf.agentId;
  }

  // Plan quota gate (2.5): over-limit live runs are parked as blocked —
  // graceful degradation, never dropped. Simulation and chat stay free.
  const mode = input.mode ?? "live";
  let status: "queued" | "blocked" = "queued";
  let statusReason: string | undefined;
  if (mode === "live") {
    const quota = await checkRunQuota(db, input.workspaceId);
    if (!quota.allowed) {
      status = "blocked";
      statusReason = `Monthly run limit reached (${quota.used}/${quota.limit} on the ${quota.plan.name} plan). Upgrade in Billing, then requeue this run.`;
    }
  }

  const [run] = await db
    .insert(workflowRuns)
    .values({
      workspaceId: input.workspaceId,
      workflowId: input.workflowId ?? null,
      agentId,
      mode,
      triggerType: input.triggerType,
      triggerSnapshot: input.triggerSnapshot ?? {},
      status,
      statusReason,
    })
    .returning({ id: workflowRuns.id });

  if (status === "blocked") {
    // Notify at most once a day per workspace — scheduled triggers would
    // otherwise flood the feed while over quota.
    const recent = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, input.workspaceId),
          eq(notifications.kind, "run_blocked"),
          eq(notifications.href, "/billing"),
          gte(notifications.createdAt, new Date(Date.now() - 86_400_000)),
        ),
      )
      .limit(1);
    if (recent.length === 0) {
      await notifyWorkspace(db, {
        workspaceId: input.workspaceId,
        kind: "run_blocked",
        title: "Runs paused: monthly plan limit reached",
        body: statusReason,
        href: "/billing",
      });
    }
  }
  return run!.id;
}

// Requeue a run that was parked at the quota gate (after a plan upgrade).
export async function requeueBlockedRun(db: Db, workspaceId: string, runId: string): Promise<boolean> {
  const quota = await checkRunQuota(db, workspaceId);
  if (!quota.allowed) return false;
  const updated = await db
    .update(workflowRuns)
    .set({ status: "queued", statusReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.workspaceId, workspaceId),
        eq(workflowRuns.status, "blocked"),
      ),
    )
    .returning({ id: workflowRuns.id });
  return updated.length > 0;
}
