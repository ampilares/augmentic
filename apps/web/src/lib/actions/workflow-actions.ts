"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { workflowTriggers, workflows } from "@augmentic/db";
import { createWorkflowSchema, type TriggerConfig } from "@augmentic/shared";
import { computeNextFire, enqueueRun, recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

export async function createWorkflowAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const triggerType = String(formData.get("triggerType") ?? "manual");
  const trigger: TriggerConfig =
    triggerType === "schedule"
      ? {
          type: "schedule",
          schedule: {
            cron: String(formData.get("cron") ?? "0 8 * * *"),
            timezone: String(formData.get("timezone") ?? "UTC"),
          },
        }
      : triggerType === "webhook"
        ? { type: "webhook" }
        : triggerType === "app_event"
          ? {
              type: "app_event",
              provider: "gmail",
              event: "new_message",
              filter: String(formData.get("eventFilter") ?? ""),
            }
          : { type: "manual" };

  const parsed = createWorkflowSchema.parse({
    templateId: (formData.get("templateId") as string) || null,
    name: formData.get("name"),
    instructions: formData.get("instructions"),
    agentId: formData.get("agentId"),
    trigger,
    delivery: {
      target: (formData.get("deliveryTarget") as string) || "run_log",
      slackChannel: (formData.get("slackChannel") as string) || undefined,
      emailTo: (formData.get("emailTo") as string) || undefined,
    },
  });

  const [wf] = await ctx.db
    .insert(workflows)
    .values({
      workspaceId: ctx.workspace.id,
      templateId: parsed.templateId,
      name: parsed.name,
      instructions: parsed.instructions,
      agentId: parsed.agentId,
      deliveryConfig: parsed.delivery,
      approvalPolicy: parsed.approvalPolicy ?? {},
      status: "ready",
    })
    .returning({ id: workflows.id });

  const nextFire =
    parsed.trigger.type === "schedule"
      ? computeNextFire(parsed.trigger.schedule.cron, parsed.trigger.schedule.timezone)
      : null;

  await ctx.db.insert(workflowTriggers).values({
    workspaceId: ctx.workspace.id,
    workflowId: wf!.id,
    triggerType: parsed.trigger.type,
    config: parsed.trigger,
    webhookToken:
      parsed.trigger.type === "webhook"
        ? crypto.randomBytes(20).toString("hex")
        : null,
    webhookSecret:
      parsed.trigger.type === "webhook"
        ? crypto.randomBytes(24).toString("hex")
        : null,
    nextFireAt: nextFire,
    enabled: parsed.trigger.type !== "schedule" ? true : false,
    // Schedules activate when the workflow is activated (after simulation).
  });

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "workflow.created",
    entityType: "workflow",
    entityId: wf!.id,
    payload: { name: parsed.name, trigger: parsed.trigger.type },
  });
  redirect(`/w/${workspaceSlug}/workflows/${wf!.id}`);
}

export async function runWorkflowAction(
  workspaceSlug: string,
  workflowId: string,
  mode: "live" | "simulation",
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const [wf] = await ctx.db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.workspaceId, ctx.workspace.id)));
  if (!wf) throw new Error("Workflow not found");
  const runId = await enqueueRun(ctx.db, {
    workspaceId: ctx.workspace.id,
    workflowId,
    mode,
    triggerType: "manual",
    triggerSnapshot: { requestedBy: ctx.user.email },
  });
  if (mode === "simulation") {
    await ctx.db
      .update(workflows)
      .set({ lastSimulatedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflows.id, workflowId));
  }
  redirect(`/w/${workspaceSlug}/runs/${runId}`);
}

export async function setWorkflowStatusAction(
  workspaceSlug: string,
  workflowId: string,
  status: "active" | "paused",
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  await ctx.db
    .update(workflows)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(workflows.id, workflowId), eq(workflows.workspaceId, ctx.workspace.id)));
  // Enable/disable schedule triggers alongside workflow activation.
  const triggers = await ctx.db
    .select()
    .from(workflowTriggers)
    .where(
      and(
        eq(workflowTriggers.workflowId, workflowId),
        eq(workflowTriggers.workspaceId, ctx.workspace.id),
      ),
    );
  for (const t of triggers) {
    if (t.triggerType === "schedule") {
      const cfg = t.config as { schedule?: { cron?: string; timezone?: string } };
      const next =
        status === "active" && cfg.schedule?.cron
          ? computeNextFire(cfg.schedule.cron, cfg.schedule.timezone ?? "UTC")
          : null;
      await ctx.db
        .update(workflowTriggers)
        .set({ enabled: status === "active", nextFireAt: next, updatedAt: new Date() })
        .where(eq(workflowTriggers.id, t.id));
    }
  }
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: `workflow.${status === "active" ? "activated" : "paused"}`,
    entityType: "workflow",
    entityId: workflowId,
  });
  revalidatePath(`/w/${workspaceSlug}/workflows/${workflowId}`);
  revalidatePath(`/w/${workspaceSlug}/workflows`);
}
