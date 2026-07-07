"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { agentSkills, skills } from "@augmentic/db";
import { recordAudit } from "@augmentic/engine";
import { TOOL_CATALOG_BY_NAME } from "@augmentic/shared";
import { requireWorkspace } from "../context";

const createSkillSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(300),
  instructions: z.string().trim().min(1).max(10000),
  allowedTools: z.array(z.string()).max(20),
  inputSchema: z.string().max(4000).optional(),
  outputSchema: z.string().max(4000).optional(),
});

function parseOptionalJson(raw: string | undefined, field: string): unknown {
  if (!raw || raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function createSkillAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const parsed = createSkillSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    instructions: formData.get("instructions"),
    allowedTools: formData
      .getAll("allowedTools")
      .map(String)
      .filter((t) => TOOL_CATALOG_BY_NAME[t]),
    inputSchema: (formData.get("inputSchema") as string) || undefined,
    outputSchema: (formData.get("outputSchema") as string) || undefined,
  });
  await ctx.db.insert(skills).values({
    workspaceId: ctx.workspace.id,
    slug: `${slugify(parsed.name)}-${Date.now().toString(36)}`,
    name: parsed.name,
    description: parsed.description,
    instructions: parsed.instructions,
    allowedTools: parsed.allowedTools,
    inputSchema: parseOptionalJson(parsed.inputSchema, "Input schema") as never,
    outputSchema: parseOptionalJson(parsed.outputSchema, "Output schema") as never,
  });
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "skill.created",
    payload: { name: parsed.name },
  });
  revalidatePath(`/w/${workspaceSlug}/skills`);
}

export async function deleteSkillAction(
  workspaceSlug: string,
  skillId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  // Only workspace-owned skills can be deleted; built-ins have null workspace.
  await ctx.db
    .delete(skills)
    .where(and(eq(skills.id, skillId), eq(skills.workspaceId, ctx.workspace.id)));
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "skill.deleted",
    entityType: "skill",
    entityId: skillId,
  });
  revalidatePath(`/w/${workspaceSlug}/skills`);
}

export async function toggleAgentSkillAction(
  workspaceSlug: string,
  agentId: string,
  skillId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const [existing] = await ctx.db
    .select()
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.workspaceId, ctx.workspace.id),
        eq(agentSkills.agentId, agentId),
        eq(agentSkills.skillId, skillId),
      ),
    );
  if (existing) {
    await ctx.db
      .update(agentSkills)
      .set({ enabled: !existing.enabled })
      .where(eq(agentSkills.id, existing.id));
  } else {
    await ctx.db.insert(agentSkills).values({
      workspaceId: ctx.workspace.id,
      agentId,
      skillId,
      enabled: true,
    });
  }
  revalidatePath(`/w/${workspaceSlug}/agents/${agentId}`);
}
