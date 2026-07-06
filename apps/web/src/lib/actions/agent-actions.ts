"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  agentTemplates,
  agents,
  memoryItems,
  toolDefinitions,
  toolPermissionPolicies,
} from "@augmentic/db";
import {
  hireAgentSchema,
  memoryItemSchema,
  updateToolPermissionSchema,
  TOOL_PERMISSION_SETTINGS,
} from "@augmentic/shared";
import { recordActivationMetric, recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

export async function hireAgentAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const parsed = hireAgentSchema.parse({
    templateId: (formData.get("templateId") as string) || null,
    name: formData.get("name"),
    roleTitle: formData.get("roleTitle"),
    jobDescription: formData.get("jobDescription"),
    autonomyMode: (formData.get("autonomyMode") as string) || "draft_only",
    supervisorUserId: (formData.get("supervisorUserId") as string) || null,
    spendCapMonthlyCents: formData.get("spendCapMonthlyCents")
      ? Math.round(Number(formData.get("spendCapMonthlyCents")) * 100)
      : null,
  });

  const [agent] = await ctx.db
    .insert(agents)
    .values({
      workspaceId: ctx.workspace.id,
      templateId: parsed.templateId,
      name: parsed.name,
      roleTitle: parsed.roleTitle,
      jobDescription: parsed.jobDescription,
      autonomyMode: parsed.autonomyMode,
      supervisorUserId: parsed.supervisorUserId ?? ctx.user.id,
      spendCapMonthlyCents: parsed.spendCapMonthlyCents ?? null,
      status: "needs_setup",
    })
    .returning({ id: agents.id });

  // Apply template approval-policy defaults as per-agent tool permissions.
  if (parsed.templateId) {
    const [template] = await ctx.db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, parsed.templateId));
    const defaults = (template?.approvalPolicyDefaults ?? {}) as Record<string, string>;
    for (const [toolName, setting] of Object.entries(defaults)) {
      if (!(TOOL_PERMISSION_SETTINGS as readonly string[]).includes(setting)) continue;
      const [def] = await ctx.db
        .select({ id: toolDefinitions.id })
        .from(toolDefinitions)
        .where(eq(toolDefinitions.name, toolName));
      if (def) {
        await ctx.db.insert(toolPermissionPolicies).values({
          workspaceId: ctx.workspace.id,
          agentId: agent!.id,
          toolDefinitionId: def.id,
          setting: setting as never,
        });
      }
    }
  }

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "agent.hired",
    entityType: "agent",
    entityId: agent!.id,
    payload: { name: parsed.name, roleTitle: parsed.roleTitle, templateId: parsed.templateId },
  });
  await recordActivationMetric(ctx.db, ctx.workspace.id, "first_agent_created");
  redirect(`/w/${workspaceSlug}/agents/${agent!.id}`);
}

export async function updateAgentAction(
  workspaceSlug: string,
  agentId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "roleTitle", "jobDescription", "autonomyMode", "status"] as const) {
    const v = formData.get(key);
    if (v !== null && v !== "") updates[key] = v;
  }
  const cap = formData.get("spendCapMonthly");
  if (cap !== null) {
    updates.spendCapMonthlyCents = cap === "" ? null : Math.round(Number(cap) * 100);
  }
  await ctx.db
    .update(agents)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, ctx.workspace.id)));
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "agent.updated",
    entityType: "agent",
    entityId: agentId,
    payload: updates,
  });
  revalidatePath(`/w/${workspaceSlug}/agents/${agentId}`);
  revalidatePath(`/w/${workspaceSlug}`);
}

export async function completeAgentSetupAction(
  workspaceSlug: string,
  agentId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  // Setup interview answers become memory items (Spec §6).
  const entries = formData.getAll("answer") as string[];
  const questions = formData.getAll("question") as string[];
  for (let i = 0; i < entries.length; i++) {
    const answer = entries[i]?.trim();
    if (!answer) continue;
    await ctx.db.insert(memoryItems).values({
      workspaceId: ctx.workspace.id,
      agentId,
      kind: "sop",
      content: `${questions[i] ?? "Setup note"}: ${answer}`,
    });
  }
  await ctx.db
    .update(agents)
    .set({ status: "active", setupCompletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, ctx.workspace.id)));
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "agent.setup_completed",
    entityType: "agent",
    entityId: agentId,
  });
  revalidatePath(`/w/${workspaceSlug}/agents/${agentId}`);
}

export async function addMemoryAction(
  workspaceSlug: string,
  agentId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const parsed = memoryItemSchema.parse({
    kind: formData.get("kind"),
    content: formData.get("content"),
  });
  await ctx.db.insert(memoryItems).values({
    workspaceId: ctx.workspace.id,
    agentId,
    kind: parsed.kind,
    content: parsed.content,
  });
  revalidatePath(`/w/${workspaceSlug}/agents/${agentId}`);
}

export async function deleteMemoryAction(
  workspaceSlug: string,
  agentId: string,
  memoryId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  await ctx.db
    .delete(memoryItems)
    .where(
      and(
        eq(memoryItems.id, memoryId),
        eq(memoryItems.workspaceId, ctx.workspace.id),
        eq(memoryItems.agentId, agentId),
      ),
    );
  revalidatePath(`/w/${workspaceSlug}/agents/${agentId}`);
}

export async function setToolPermissionAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const parsed = updateToolPermissionSchema.parse({
    agentId: formData.get("agentId"),
    toolDefinitionId: formData.get("toolDefinitionId"),
    setting: formData.get("setting"),
  });
  const existing = await ctx.db
    .select({ id: toolPermissionPolicies.id })
    .from(toolPermissionPolicies)
    .where(
      and(
        eq(toolPermissionPolicies.workspaceId, ctx.workspace.id),
        eq(toolPermissionPolicies.agentId, parsed.agentId),
        eq(toolPermissionPolicies.toolDefinitionId, parsed.toolDefinitionId),
      ),
    );
  if (existing.length > 0) {
    await ctx.db
      .update(toolPermissionPolicies)
      .set({ setting: parsed.setting, updatedAt: new Date() })
      .where(eq(toolPermissionPolicies.id, existing[0]!.id));
  } else {
    await ctx.db.insert(toolPermissionPolicies).values({
      workspaceId: ctx.workspace.id,
      agentId: parsed.agentId,
      toolDefinitionId: parsed.toolDefinitionId,
      setting: parsed.setting,
    });
  }
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "tool_permission.changed",
    entityType: "agent",
    entityId: parsed.agentId,
    payload: { toolDefinitionId: parsed.toolDefinitionId, setting: parsed.setting },
  });
  revalidatePath(`/w/${workspaceSlug}/agents/${parsed.agentId}`);
}
