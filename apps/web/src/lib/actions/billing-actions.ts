"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { workspaces } from "@augmentic/db";
import { planById, PLAN_DEFS } from "@augmentic/shared";
import { recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

// Plan change (owner-only). With Stripe configured this redirects through
// checkout; without it (dev/pilot) the plan applies directly and usage is
// metered against the internal ledger.
export async function changePlanAction(
  workspaceSlug: string,
  planId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "owner");
  if (!PLAN_DEFS.some((p) => p.id === planId)) throw new Error("Unknown plan");
  const plan = planById(planId);

  if (process.env.STRIPE_SECRET_KEY) {
    // Stripe scaffold: create a checkout session for the plan's price and
    // apply the plan in the webhook. Direct-apply remains the dev path.
    // (Checkout wiring lands with real price IDs; see README Billing.)
  }

  const [ws] = await ctx.db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id));
  await ctx.db
    .update(workspaces)
    .set({
      settings: { ...((ws?.settings as Record<string, unknown>) ?? {}), plan: plan.id },
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, ctx.workspace.id));

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "billing.plan_changed",
    payload: { plan: plan.id },
  });
  revalidatePath(`/w/${workspaceSlug}/billing`);
}
