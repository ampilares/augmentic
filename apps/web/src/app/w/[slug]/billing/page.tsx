import { and, eq, gte, sql } from "drizzle-orm";
import { agents, usageLedgerEntries, workspaces } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, PageHeader } from "@/components/ui";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    blurb: "1 AI employee, core integrations, limited runs, approval center.",
    agentLimit: 1,
  },
  {
    id: "growth",
    name: "Growth",
    blurb: "Up to 5 AI employees, workflows, schedules, usage dashboard, team roles.",
    agentLimit: 5,
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "More agents, higher limits, custom workflows, vertical packs, priority support.",
    agentLimit: 15,
  },
];

export default async function BillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [[ws], agentRows, usage] = await Promise.all([
    ctx.db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspace.id)),
    ctx.db.select({ id: agents.id }).from(agents).where(eq(agents.workspaceId, ctx.workspace.id)),
    ctx.db
      .select({
        kind: usageLedgerEntries.kind,
        cost: sql<number>`coalesce(sum(${usageLedgerEntries.costCents}), 0)`,
        count: sql<number>`count(*)`,
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

  const settings = (ws?.settings ?? {}) as { plan?: string };
  const planId = settings.plan ?? "starter";
  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0]!;
  const spendCents = usage.reduce((acc, u) => acc + Number(u.cost), 0);
  const creditCents = usage
    .filter((u) => u.kind === "credit")
    .reduce((acc, u) => acc - Number(u.cost), 0); // credits recorded as negative cost
  const runs = Number(usage.find((u) => u.kind === "run")?.count ?? 0);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Billing"
        subtitle="Simple packaging that maps to AI employees plus usage — never tokens."
      />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <p className="text-2xl font-semibold capitalize">{plan.name}</p>
          <p className="text-sm text-slate-500">
            current plan · {agentRows.length}/{plan.agentLimit} AI employees
          </p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">${(spendCents / 100).toFixed(2)}</p>
          <p className="text-sm text-slate-500">usage this month · {runs} runs</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">${(creditCents / 100).toFixed(2)}</p>
          <p className="text-sm text-slate-500">credit balance</p>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {PLANS.map((p) => (
          <Card key={p.id} className={p.id === planId ? "border-brand-500" : ""}>
            <p className="font-medium text-slate-900">{p.name}</p>
            <p className="mt-1 text-sm text-slate-500">{p.blurb}</p>
            {p.id === planId && (
              <p className="mt-3 text-xs font-medium text-brand-600">Current plan</p>
            )}
          </Card>
        ))}
      </div>

      <Card className="mt-6 bg-slate-50">
        <p className="text-sm text-slate-600">
          {stripeConfigured
            ? "Stripe is configured — checkout and invoices are coming with plan enforcement."
            : "Payments are not enabled yet. Set STRIPE_SECRET_KEY to connect Stripe; usage is metered against the internal ledger in the meantime."}
        </p>
      </Card>
    </div>
  );
}
