import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { agents, usageLedgerEntries, workspaces } from "@augmentic/db";
import { PLANS, PLAN_IDS, planFromSettings, trialEndsAt } from "@augmentic/shared";
import { checkRunQuota, recordAudit } from "@augmentic/engine";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import { changePlanAction } from "@/lib/actions/billing-actions";
import { Button, Card, PageHeader } from "@/components/ui";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string; limit?: string }>;
}) {
  const { slug } = await params;
  const { session_id: sessionId, limit } = await searchParams;
  const ctx = await requireWorkspace(slug);
  const isAdmin = roleAtLeast(ctx.role, "admin");

  // Stripe Checkout return: verify the session actually paid before
  // flipping the plan (the URL param alone proves nothing).
  if (sessionId && isAdmin && process.env.STRIPE_SECRET_KEY) {
    const paidPlan = await verifyStripeSession(sessionId, slug);
    if (paidPlan) {
      const [ws] = await ctx.db
        .select({ settings: workspaces.settings })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspace.id));
      await ctx.db
        .update(workspaces)
        .set({
          settings: { ...((ws?.settings as Record<string, unknown>) ?? {}), plan: paidPlan },
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, ctx.workspace.id));
      await recordAudit(ctx.db, {
        workspaceId: ctx.workspace.id,
        actorType: "user",
        actorId: ctx.user.id,
        actorLabel: ctx.user.email,
        eventType: "billing.plan_changed",
        payload: { plan: paidPlan, viaStripe: true },
      });
    }
    redirect(`/w/${slug}/billing`);
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [[ws], agentRows, usage, runQuota] = await Promise.all([
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
    checkRunQuota(ctx.db, ctx.workspace.id),
  ]);

  const plan = planFromSettings(ws?.settings);
  const trialUntil = trialEndsAt(ws?.settings);
  const spendCents = usage.reduce((acc, u) => acc + Number(u.cost), 0);
  const creditCents = usage
    .filter((u) => u.kind === "credit")
    .reduce((acc, u) => acc - Number(u.cost), 0); // credits recorded as negative cost
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const agentsOver = agentRows.length >= plan.agentLimit;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Billing"
        subtitle="Simple packaging that maps to AI employees plus usage — never tokens."
      />

      {limit === "agents" && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            Your {plan.name} plan includes {plan.agentLimit} AI employee
            {plan.agentLimit === 1 ? "" : "s"} and you're using {agentRows.length}. Upgrade
            below to hire more.
          </p>
        </Card>
      )}
      {!runQuota.allowed && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            You've used all {runQuota.limit} runs included this month. New runs are parked —
            nothing is lost — and will be requeueable after an upgrade.
          </p>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-2xl font-semibold capitalize">{plan.name}</p>
          <p className="text-sm text-slate-500">
            {trialUntil
              ? `trial until ${trialUntil.toLocaleDateString()}`
              : "current plan"}{" "}
            · {agentRows.length}/{plan.agentLimit} AI employees
          </p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">
            {runQuota.used}
            <span className="text-base font-normal text-slate-400">/{runQuota.limit}</span>
          </p>
          <p className="text-sm text-slate-500">runs this month</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">${(spendCents / 100).toFixed(2)}</p>
          <p className="text-sm text-slate-500">usage this month</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">${(creditCents / 100).toFixed(2)}</p>
          <p className="text-sm text-slate-500">credit balance</p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_IDS.map((pid) => {
          const p = PLANS[pid];
          const current = p.id === plan.id;
          return (
            <Card key={p.id} className={current ? "border-brand-500" : ""}>
              <p className="font-medium text-slate-900">{p.name}</p>
              <p className="text-sm text-slate-500">
                ${(p.priceCentsMonthly / 100).toFixed(0)}/mo
              </p>
              <p className="mt-1 text-sm text-slate-500">{p.blurb}</p>
              <p className="mt-2 text-xs text-slate-400">
                {p.agentLimit} AI employees · {p.monthlyRunLimit.toLocaleString()} runs/mo
              </p>
              {current ? (
                <p className="mt-3 text-xs font-medium text-brand-600">Current plan</p>
              ) : (
                isAdmin && (
                  <form action={changePlanAction.bind(null, slug)} className="mt-3">
                    <input type="hidden" name="planId" value={p.id} />
                    <Button variant="secondary" type="submit">
                      {stripeConfigured ? `Switch via checkout` : `Switch to ${p.name}`}
                    </Button>
                  </form>
                )
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 bg-slate-50">
        <p className="text-sm text-slate-600">
          {stripeConfigured
            ? "Stripe is connected — plan changes go through Stripe Checkout and flip after payment."
            : "Payments are not enabled yet. Set STRIPE_SECRET_KEY to route plan changes through Stripe Checkout; until then plan changes apply directly and usage is metered against the internal ledger."}
        </p>
      </Card>

      {agentsOver && (
        <p className="mt-4 text-xs text-slate-400">
          At the agent limit for {plan.name}. Hiring another AI employee will bring you here.
        </p>
      )}
    </div>
  );
}

// Fetch the Checkout session from Stripe and confirm it is paid and belongs
// to this workspace before trusting its metadata.
async function verifyStripeSession(
  sessionId: string,
  workspaceSlug: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } },
    );
    if (!res.ok) return null;
    const session = (await res.json()) as {
      payment_status?: string;
      metadata?: { workspaceSlug?: string; plan?: string };
    };
    if (session.payment_status !== "paid") return null;
    if (session.metadata?.workspaceSlug !== workspaceSlug) return null;
    return session.metadata?.plan ?? null;
  } catch {
    return null;
  }
}
