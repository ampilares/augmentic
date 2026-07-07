import { and, eq, gte, sql } from "drizzle-orm";
import { usageLedgerEntries } from "@augmentic/db";
import { PLAN_DEFS } from "@augmentic/shared";
import { checkPlanLimits } from "@augmentic/engine";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import { changePlanAction } from "@/lib/actions/billing-actions";
import { Button, Card, PageHeader } from "@/components/ui";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const isOwner = roleAtLeast(ctx.role, "owner");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [status, usage] = await Promise.all([
    checkPlanLimits(ctx.db, ctx.workspace.id),
    ctx.db
      .select({
        kind: usageLedgerEntries.kind,
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
  ]);

  const spendCents = usage.reduce((acc, u) => acc + Math.max(0, Number(u.cost)), 0);
  const creditCents = usage
    .filter((u) => u.kind === "credit")
    .reduce((acc, u) => acc - Number(u.cost), 0);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const runPct = Math.min(
    100,
    Math.round((status.liveRunsThisMonth / status.plan.monthlyRunLimit) * 100),
  );

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Billing"
        subtitle="Simple packaging that maps to AI employees plus usage — never tokens."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-2xl font-semibold">{status.plan.name}</p>
          <p className="text-sm text-slate-500">
            {status.agentCount}/{status.plan.agentLimit} AI employees
          </p>
          {status.agentLimitReached && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Agent limit reached — upgrade to hire more.
            </p>
          )}
        </Card>
        <Card>
          <p className="text-2xl font-semibold">
            {status.liveRunsThisMonth}
            <span className="text-base font-normal text-slate-400">
              /{status.plan.monthlyRunLimit}
            </span>
          </p>
          <p className="text-sm text-slate-500">live runs this month</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
            <div
              className={`h-1.5 rounded-full ${runPct >= 100 ? "bg-red-500" : runPct >= 80 ? "bg-amber-400" : "bg-brand-500"}`}
              style={{ width: `${runPct}%` }}
            />
          </div>
          {status.runLimitReached && (
            <p className="mt-1 text-xs font-medium text-red-700">
              Run limit reached — new live runs pause until upgrade or next month. No work is
              lost.
            </p>
          )}
        </Card>
        <Card>
          <p className="text-2xl font-semibold">${(spendCents / 100).toFixed(2)}</p>
          <p className="text-sm text-slate-500">
            usage this month · ${(creditCents / 100).toFixed(2)} credit
          </p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_DEFS.map((p) => (
          <Card key={p.id} className={p.id === status.plan.id ? "border-brand-500" : ""}>
            <p className="font-medium text-slate-900">{p.name}</p>
            <p className="text-sm text-slate-500">
              ${p.priceMonthlyUsd}/mo · {p.agentLimit} agents · {p.monthlyRunLimit} runs
            </p>
            <p className="mt-1 text-sm text-slate-500">{p.blurb}</p>
            {p.id === status.plan.id ? (
              <p className="mt-3 text-xs font-medium text-brand-600">Current plan</p>
            ) : (
              isOwner && (
                <form action={changePlanAction.bind(null, slug, p.id)} className="mt-3">
                  <Button variant="secondary" type="submit">
                    Switch to {p.name}
                  </Button>
                </form>
              )
            )}
          </Card>
        ))}
      </div>

      <Card className="mt-6 bg-slate-50">
        <p className="text-sm text-slate-600">
          {stripeConfigured
            ? "Stripe is configured — plan changes will route through checkout once price IDs are set."
            : "Payments are not enabled yet (set STRIPE_SECRET_KEY). Plan changes apply directly and usage is metered against the internal ledger."}
        </p>
      </Card>
    </div>
  );
}
