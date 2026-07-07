import { agents, workflowRuns, workspaces, type Db } from "@augmentic/db";
import { planFromSettings, type PlanDef } from "@augmentic/shared";
import { and, eq, gte, ne, sql } from "drizzle-orm";

// Plan-limit enforcement (plan 2.5). Two gates:
//  - agent count, checked at hire/pack-install time via checkAgentQuota
//  - monthly live runs, checked inside enqueueRun via checkRunQuota; an
//    over-quota run is inserted as `blocked` (state preserved, never lost)
//    and can be requeued after an upgrade.

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
  plan: PlanDef;
}

export async function getWorkspacePlan(db: Db, workspaceId: string): Promise<PlanDef> {
  const [ws] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return planFromSettings(ws?.settings);
}

export async function checkAgentQuota(
  db: Db,
  workspaceId: string,
  adding = 1,
): Promise<QuotaStatus> {
  const plan = await getWorkspacePlan(db, workspaceId);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId));
  const used = Number(row?.count ?? 0);
  return { allowed: used + adding <= plan.agentLimit, used, limit: plan.agentLimit, plan };
}

export function currentMonthStart(): Date {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function checkRunQuota(db: Db, workspaceId: string): Promise<QuotaStatus> {
  const plan = await getWorkspacePlan(db, workspaceId);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, workspaceId),
        eq(workflowRuns.mode, "live"),
        // Blocked-at-the-gate runs never consumed quota.
        ne(workflowRuns.status, "blocked"),
        gte(workflowRuns.createdAt, currentMonthStart()),
      ),
    );
  const used = Number(row?.count ?? 0);
  return { allowed: used < plan.monthlyRunLimit, used, limit: plan.monthlyRunLimit, plan };
}
