import { and, desc, eq, gte, sql } from "drizzle-orm";
import { agents, usageLedgerEntries } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, PageHeader } from "@/components/ui";

export default async function UsagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byKind, byAgent, recent] = await Promise.all([
    ctx.db
      .select({
        kind: usageLedgerEntries.kind,
        count: sql<number>`count(*)`,
        cost: sql<number>`coalesce(sum(${usageLedgerEntries.costCents}), 0)`,
      })
      .from(usageLedgerEntries)
      .where(
        and(
          eq(usageLedgerEntries.workspaceId, ctx.workspace.id),
          gte(usageLedgerEntries.createdAt, monthStart),
        ),
      )
      .groupBy(usageLedgerEntries.kind),
    ctx.db
      .select({
        agentName: agents.name,
        capCents: agents.spendCapMonthlyCents,
        cost: sql<number>`coalesce(sum(${usageLedgerEntries.costCents}), 0)`,
        entries: sql<number>`count(*)`,
      })
      .from(usageLedgerEntries)
      .innerJoin(agents, eq(usageLedgerEntries.agentId, agents.id))
      .where(
        and(
          eq(usageLedgerEntries.workspaceId, ctx.workspace.id),
          gte(usageLedgerEntries.createdAt, monthStart),
        ),
      )
      .groupBy(agents.name, agents.spendCapMonthlyCents),
    ctx.db
      .select()
      .from(usageLedgerEntries)
      .where(eq(usageLedgerEntries.workspaceId, ctx.workspace.id))
      .orderBy(desc(usageLedgerEntries.createdAt))
      .limit(50),
  ]);

  const totalCost = byKind.reduce((acc, k) => acc + Number(k.cost), 0);
  const runs = Number(byKind.find((k) => k.kind === "run")?.count ?? 0);
  const toolCalls = Number(byKind.find((k) => k.kind === "tool_call")?.count ?? 0);

  return (
    <div>
      <PageHeader
        title="Usage"
        subtitle="This month's work and cost — per agent, workflow, and run. You'll never be shown tokens."
      />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <p className="text-2xl font-semibold">${(totalCost / 100).toFixed(2)}</p>
          <p className="text-sm text-slate-500">AI spend this month</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">{runs}</p>
          <p className="text-sm text-slate-500">completed runs</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">{toolCalls}</p>
          <p className="text-sm text-slate-500">tool calls</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="mb-3 font-medium text-slate-900">Per agent (this month)</h3>
          {byAgent.length === 0 ? (
            <p className="text-sm text-slate-500">No usage yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {byAgent.map((a) => (
                <li key={a.agentName} className="flex justify-between py-2">
                  <span className="text-slate-700">{a.agentName}</span>
                  <span className="text-slate-500">
                    ${(Number(a.cost) / 100).toFixed(2)}
                    {a.capCents !== null && ` / $${(a.capCents / 100).toFixed(0)} cap`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 font-medium text-slate-900">Recent entries</h3>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-auto text-xs">
            {recent.map((e) => (
              <li key={e.id} className="flex justify-between py-1.5">
                <span className="text-slate-600">
                  {e.kind}
                  {e.model ? ` · ${e.model}` : ""}
                </span>
                <span className="text-slate-400">
                  {e.costCents > 0 ? `$${(e.costCents / 100).toFixed(3)}` : "—"} ·{" "}
                  {new Date(e.createdAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
