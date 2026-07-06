"use server";

import { redirect } from "next/navigation";
import { eq, isNull } from "drizzle-orm";
import {
  agents,
  agentTemplates,
  knowledgeCollections,
  knowledgeItems,
  workflows,
  workflowTemplates,
  workflowTriggers,
} from "@augmentic/db";
import { VERTICAL_PACKS } from "@augmentic/db/seed";
import { recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";
import { applyTemplateDefaults } from "../services/agent-provisioning";

const AGENT_NAMES: Record<string, string> = {
  "executive-assistant": "Emmy",
  "sales-ops-rep": "Sawyer",
  "client-success-rep": "Cleo",
  "finance-admin": "Frankie",
  "marketing-ops-assistant": "Marlo",
};

// One-click vertical pack install (FR-025): agents + workflows + SOP
// knowledge + policy defaults. Everything lands paused/draft-first — the
// user reviews, simulates, and activates.
export async function installPackAction(
  workspaceSlug: string,
  packSlug: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const pack = VERTICAL_PACKS.find((p) => p.slug === packSlug);
  if (!pack) throw new Error(`Unknown pack ${packSlug}`);

  const [templates, wfTemplates, existingAgents] = await Promise.all([
    ctx.db.select().from(agentTemplates).where(isNull(agentTemplates.workspaceId)),
    ctx.db.select().from(workflowTemplates),
    ctx.db.select().from(agents).where(eq(agents.workspaceId, ctx.workspace.id)),
  ]);

  // Create (or reuse) one agent per pack role.
  const agentByTemplateSlug = new Map<string, string>();
  for (const slug of pack.agentTemplateSlugs) {
    const template = templates.find((t) => t.slug === slug);
    if (!template) continue;
    const existing = existingAgents.find((a) => a.templateId === template.id);
    if (existing) {
      agentByTemplateSlug.set(slug, existing.id);
      continue;
    }
    const [agent] = await ctx.db
      .insert(agents)
      .values({
        workspaceId: ctx.workspace.id,
        templateId: template.id,
        name: AGENT_NAMES[slug] ?? template.roleTitle,
        roleTitle: template.roleTitle,
        jobDescription: template.jobDescription,
        status: "needs_setup",
        autonomyMode: "draft_only",
        supervisorUserId: ctx.user.id,
      })
      .returning({ id: agents.id });
    await applyTemplateDefaults(ctx.db, ctx.workspace.id, agent!.id, template);
    agentByTemplateSlug.set(slug, agent!.id);
  }

  // Create pack workflows (draft; schedules activate on workflow activation).
  const existingWorkflows = await ctx.db
    .select({ templateId: workflows.templateId })
    .from(workflows)
    .where(eq(workflows.workspaceId, ctx.workspace.id));
  const existingTemplateIds = new Set(existingWorkflows.map((w) => w.templateId));
  for (const spec of pack.workflows) {
    const wfTemplate = wfTemplates.find((t) => t.slug === spec.templateSlug);
    const agentId = agentByTemplateSlug.get(spec.agentTemplateSlug);
    if (!wfTemplate || !agentId || existingTemplateIds.has(wfTemplate.id)) continue;
    const [wf] = await ctx.db
      .insert(workflows)
      .values({
        workspaceId: ctx.workspace.id,
        templateId: wfTemplate.id,
        name: wfTemplate.name,
        instructions: wfTemplate.instructions,
        agentId,
        deliveryConfig: spec.delivery,
        approvalPolicy: wfTemplate.defaultApprovalPolicy ?? {},
        status: "draft",
      })
      .returning({ id: workflows.id });
    const trigger = spec.trigger;
    const isSchedule = trigger.type === "schedule";
    await ctx.db.insert(workflowTriggers).values({
      workspaceId: ctx.workspace.id,
      workflowId: wf!.id,
      triggerType: trigger.type,
      config:
        trigger.type === "schedule"
          ? { type: "schedule", schedule: { cron: trigger.cron, timezone: "UTC" } }
          : { type: "manual" },
      // Disabled until the workflow is activated; preview still shows cadence.
      // Schedules stay disabled until the workflow is activated; the
      // workflow-activation action computes nextFireAt then.
      enabled: !isSchedule,
      nextFireAt: null,
    });
  }

  // Install SOP docs into workspace knowledge.
  let [collection] = await ctx.db
    .select()
    .from(knowledgeCollections)
    .where(eq(knowledgeCollections.workspaceId, ctx.workspace.id));
  if (!collection) {
    [collection] = await ctx.db
      .insert(knowledgeCollections)
      .values({
        workspaceId: ctx.workspace.id,
        name: "Workspace knowledge",
        scope: "workspace",
      })
      .returning();
  }
  const existingItems = await ctx.db
    .select({ title: knowledgeItems.title })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, ctx.workspace.id));
  const existingTitles = new Set(existingItems.map((i) => i.title));
  for (const sop of pack.sops) {
    if (existingTitles.has(sop.title)) continue;
    await ctx.db.insert(knowledgeItems).values({
      workspaceId: ctx.workspace.id,
      collectionId: collection!.id,
      sourceType: "text",
      title: sop.title,
      content: sop.content,
      tags: ["sop", pack.slug],
    });
  }

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "pack.installed",
    payload: {
      pack: pack.slug,
      agents: [...agentByTemplateSlug.keys()],
      workflows: pack.workflows.map((w) => w.templateSlug),
      sops: pack.sops.length,
    },
  });

  redirect(`/w/${workspaceSlug}`);
}
