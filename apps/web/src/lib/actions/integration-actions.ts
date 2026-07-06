"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { integrationConnections, secretRefs } from "@augmentic/db";
import { recordActivationMetric, recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

// Demo connections simulate provider data (fictional Beacon Studio dataset)
// so the full product loop works before real OAuth credentials exist.
export async function connectDemoAction(
  workspaceSlug: string,
  provider: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const existing = await ctx.db
    .select({ id: integrationConnections.id })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.workspaceId, ctx.workspace.id),
        eq(integrationConnections.provider, provider),
      ),
    );
  if (existing.length === 0) {
    await ctx.db.insert(integrationConnections).values({
      workspaceId: ctx.workspace.id,
      provider,
      accountLabel: `Demo ${provider} account`,
      scopes: ["demo"],
      isDemo: true,
      healthStatus: "connected",
      connectedByUserId: ctx.user.id,
    });
  }
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "integration.connected",
    payload: { provider, demo: true },
  });
  await recordActivationMetric(ctx.db, ctx.workspace.id, "first_integration_connected");
  revalidatePath(`/w/${workspaceSlug}/integrations`);
  revalidatePath(`/w/${workspaceSlug}`);
}

export async function disconnectIntegrationAction(
  workspaceSlug: string,
  provider: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const rows = await ctx.db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.workspaceId, ctx.workspace.id),
        eq(integrationConnections.provider, provider),
      ),
    );
  for (const row of rows) {
    if (row.secretRefId) {
      await ctx.db.delete(secretRefs).where(eq(secretRefs.id, row.secretRefId));
    }
    await ctx.db
      .delete(integrationConnections)
      .where(eq(integrationConnections.id, row.id));
  }
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "integration.disconnected",
    payload: { provider },
  });
  revalidatePath(`/w/${workspaceSlug}/integrations`);
}
