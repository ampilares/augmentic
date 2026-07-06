import {
  agents,
  budgetPolicies,
  usageLedgerEntries,
  type Db,
} from "@augmentic/db";
import { and, eq, gte, sql } from "drizzle-orm";

export interface BudgetStatus {
  ok: boolean;
  hardStopped: boolean;
  warning: boolean;
  spentCents: number;
  capCents: number | null;
  reason?: string;
}

// Budget check precedes every model/tool call batch (Spec §5 invariants).
// A hard stop pauses the agent; the worker also cancels queued runs for it.
export async function checkAgentBudget(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<BudgetStatus> {
  const [agent] = await db
    .select({
      spendCap: agents.spendCapMonthlyCents,
      status: agents.status,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)));
  if (!agent) return { ok: false, hardStopped: false, warning: false, spentCents: 0, capCents: null, reason: "Agent not found" };

  const [policy] = await db
    .select()
    .from(budgetPolicies)
    .where(
      and(
        eq(budgetPolicies.workspaceId, workspaceId),
        eq(budgetPolicies.agentId, agentId),
      ),
    );

  const capCents = policy?.monthlyCapCents ?? agent.spendCap ?? null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageLedgerEntries.costCents}), 0)`,
    })
    .from(usageLedgerEntries)
    .where(
      and(
        eq(usageLedgerEntries.workspaceId, workspaceId),
        eq(usageLedgerEntries.agentId, agentId),
        gte(usageLedgerEntries.createdAt, monthStart),
      ),
    );
  const spentCents = Number(row?.total ?? 0);

  if (capCents === null) {
    return { ok: true, hardStopped: false, warning: false, spentCents, capCents };
  }
  const warningPct = policy?.warningThresholdPct ?? 80;
  const hardStop = policy?.hardStop ?? true;
  if (spentCents >= capCents && hardStop) {
    return {
      ok: false,
      hardStopped: true,
      warning: true,
      spentCents,
      capCents,
      reason: `Monthly spend cap reached (${(spentCents / 100).toFixed(2)} of ${(capCents / 100).toFixed(2)} USD).`,
    };
  }
  return {
    ok: true,
    hardStopped: false,
    warning: spentCents >= (capCents * warningPct) / 100,
    spentCents,
    capCents,
  };
}
