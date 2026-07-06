"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  brandProfiles,
  knowledgeCollections,
  knowledgeItems,
} from "@augmentic/db";
import { addKnowledgeSchema, brandProfileSchema } from "@augmentic/shared";
import { recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

export async function addKnowledgeAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const parsed = addKnowledgeSchema.parse({
    sourceType: formData.get("sourceType") ?? "text",
    title: formData.get("title"),
    content: formData.get("content"),
    url: (formData.get("url") as string) || undefined,
    agentId: (formData.get("agentId") as string) || null,
    tags: [],
  });

  // One default collection per scope keeps MVP simple.
  const scope = parsed.agentId ? "agent" : "workspace";
  let [collection] = await ctx.db
    .select()
    .from(knowledgeCollections)
    .where(
      and(
        eq(knowledgeCollections.workspaceId, ctx.workspace.id),
        eq(knowledgeCollections.scope, scope),
        parsed.agentId
          ? eq(knowledgeCollections.agentId, parsed.agentId)
          : eq(knowledgeCollections.scope, "workspace"),
      ),
    );
  if (!collection) {
    [collection] = await ctx.db
      .insert(knowledgeCollections)
      .values({
        workspaceId: ctx.workspace.id,
        name: scope === "agent" ? "Agent knowledge" : "Workspace knowledge",
        scope,
        agentId: parsed.agentId ?? null,
      })
      .returning();
  }

  await ctx.db.insert(knowledgeItems).values({
    workspaceId: ctx.workspace.id,
    collectionId: collection!.id,
    sourceType: parsed.sourceType,
    title: parsed.title,
    content: parsed.content,
    url: parsed.url,
    tags: parsed.tags,
  });
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "knowledge.added",
    payload: { title: parsed.title, sourceType: parsed.sourceType },
  });
  revalidatePath(`/w/${workspaceSlug}/knowledge`);
}

export async function deleteKnowledgeAction(
  workspaceSlug: string,
  itemId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  await ctx.db
    .delete(knowledgeItems)
    .where(
      and(eq(knowledgeItems.id, itemId), eq(knowledgeItems.workspaceId, ctx.workspace.id)),
    );
  revalidatePath(`/w/${workspaceSlug}/knowledge`);
}

export async function saveBrandProfileAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const parsed = brandProfileSchema.parse({
    tone: formData.get("tone") ?? "",
    offerings: formData.get("offerings") ?? "",
    icp: formData.get("icp") ?? "",
    competitors: formData.get("competitors") ?? "",
    pricingNotes: formData.get("pricingNotes") ?? "",
    escalationRules: formData.get("escalationRules") ?? "",
    forbiddenClaims: formData.get("forbiddenClaims") ?? "",
    facts: formData.get("facts") ?? "",
  });
  const existing = await ctx.db
    .select({ id: brandProfiles.id })
    .from(brandProfiles)
    .where(eq(brandProfiles.workspaceId, ctx.workspace.id));
  if (existing.length > 0) {
    await ctx.db
      .update(brandProfiles)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(brandProfiles.id, existing[0]!.id));
  } else {
    await ctx.db
      .insert(brandProfiles)
      .values({ workspaceId: ctx.workspace.id, ...parsed });
  }
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "brand_profile.updated",
  });
  revalidatePath(`/w/${workspaceSlug}/brand`);
}
