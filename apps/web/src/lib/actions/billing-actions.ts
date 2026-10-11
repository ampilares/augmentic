"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { workspaces } from "@augmentic/db";
import { PLANS, type PlanId } from "@augmentic/shared";
import { recordAudit, requeueBlockedRun } from "@augmentic/engine";
import { requireWorkspace } from "../context";

// Plan change (2.5). With Stripe configured this goes through Checkout and
// the plan flips on return; without it (dev/demo) the plan flips directly —
// enforcement logic is identical either way.
export async function changePlanAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const planId = String(formData.get("planId") ?? "") as PlanId;
  const plan = PLANS[planId];
  if (!plan) throw new Error(`Unknown plan ${planId}`);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    const checkoutUrl = await createStripeCheckout(
      stripeKey,
      ctx.user.email,
      workspaceSlug,
      planId,
    );
    if (checkoutUrl) redirect(checkoutUrl);
  }

  const [ws] = await ctx.db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id));
  await ctx.db
    .update(workspaces)
    .set({
      settings: { ...((ws?.settings as Record<string, unknown>) ?? {}), plan: planId },
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, ctx.workspace.id));
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "billing.plan_changed",
    payload: { plan: planId, viaStripe: false },
  });
  revalidatePath(`/w/${workspaceSlug}/billing`);
}

// Requeue a run parked at the plan-limit gate (after upgrading).
export async function requeueRunAction(
  workspaceSlug: string,
  runId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const ok = await requeueBlockedRun(ctx.db, ctx.workspace.id, runId);
  if (ok) {
    await recordAudit(ctx.db, {
      workspaceId: ctx.workspace.id,
      actorType: "user",
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      eventType: "run.requeued",
      entityType: "workflow_run",
      entityId: runId,
    });
  }
  revalidatePath(`/w/${workspaceSlug}/runs/${runId}`);
}

// Stripe Checkout scaffold: plain REST (no SDK), subscription mode with
// inline price_data. Returns null on any failure so the caller falls back
// to a direct plan change rather than stranding the user.
async function createStripeCheckout(
  stripeKey: string,
  customerEmail: string,
  workspaceSlug: string,
  planId: PlanId,
): Promise<string | null> {
  const plan = PLANS[planId];
  const base = (process.env.AUGMENTIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const params = new URLSearchParams({
    mode: "subscription",
    customer_email: customerEmail,
    success_url: `${base}/w/${workspaceSlug}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/w/${workspaceSlug}/billing`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][unit_amount]": String(plan.priceCentsMonthly),
    "line_items[0][price_data][product_data][name]": `Augmentic ${plan.name}`,
    "metadata[workspaceSlug]": workspaceSlug,
    "metadata[plan]": planId,
  });
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const session = (await res.json()) as { url?: string };
    return session.url ?? null;
  } catch {
    return null;
  }
}
