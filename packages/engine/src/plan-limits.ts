import { agents, workflowRuns, workspaces, type Db } from "@augmentic/db";
import { planById, type PlanDef } from "@augmentic/shared";
import { and, eq, gte, sql } from "drizzle-orm";

export interface PlanStatus {
  plan: PlanDef;
  agentCount: number;
  agentLimitReached: boolean;
  liveRunsThisMonth: number;
  runLimitReached: boolean;
}

// Plan limit checks (Plan 2.5). Live runs count against the monthly limit;
// simulations are free so safe testing is never discouraged. Over-limit
// behavior is graceful: new live runs block with a legible reason, existing
// state is never lost.
export async function checkPlanLimits(db: Db, workspaceId: string): Promise<PlanStatus> {
  const [ws] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const plan = planById((ws?.settings as { plan?: string })?.plan);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [agentRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId));
  const [runRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, workspaceId),
        eq(workflowRuns.mode, "live"),
        gte(workflowRuns.createdAt, monthStart),
      ),
    );

  const agentCount = Number(agentRow?.count ?? 0);
  const liveRunsThisMonth = Number(runRow?.count ?? 0);
  return {
    plan,
    agentCount,
    agentLimitReached: agentCount >= plan.agentLimit,
    liveRunsThisMonth,
    runLimitReached: liveRunsThisMonth > plan.monthlyRunLimit,
  };
}
