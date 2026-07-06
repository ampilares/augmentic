"use server";

import { redirect } from "next/navigation";
import { eq, isNull, inArray } from "drizzle-orm";
import {
  agentTemplates,
  agents,
  workflows,
  workflowTemplates,
  workflowTriggers,
  workspaces,
} from "@augmentic/db";
import { recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

// Maps onboarding "top manual tasks" answers to role templates (Journey A).
const TASK_TO_TEMPLATE: Record<string, string> = {
  inbox: "executive-assistant",
  scheduling: "executive-assistant",
  leads: "sales-ops-rep",
  crm: "sales-ops-rep",
  client_updates: "client-success-rep",
  support: "client-success-rep",
  invoices: "finance-admin",
  bookkeeping: "finance-admin",
  social: "marketing-ops-assistant",
  content: "marketing-ops-assistant",
};

const AGENT_NAMES: Record<string, string> = {
  "executive-assistant": "Emmy",
  "sales-ops-rep": "Sawyer",
  "client-success-rep": "Cleo",
  "finance-admin": "Frankie",
  "marketing-ops-assistant": "Marlo",
};

export async function applyOnboardingAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");

  const profile = {
    industry: String(formData.get("industry") ?? ""),
    teamSize: String(formData.get("teamSize") ?? ""),
    tools: formData.getAll("tools").map(String),
    topTasks: formData.getAll("topTasks").map(String),
    riskTolerance: String(formData.get("riskTolerance") ?? "conservative"),
    completedAt: new Date().toISOString(),
  };

  await ctx.db
    .update(workspaces)
    .set({ onboardingProfile: profile, updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspace.id));

  // Propose 2-3 AI employees from the selected tasks (deduped, capped at 3).
  const templateSlugs = [
    ...new Set(
      profile.topTasks
        .map((t) => TASK_TO_TEMPLATE[t])
        .filter((s): s is string => Boolean(s)),
    ),
  ].slice(0, 3);
  if (templateSlugs.length === 0) templateSlugs.push("executive-assistant");

  const templates = await ctx.db
    .select()
    .from(agentTemplates)
    .where(isNull(agentTemplates.workspaceId));

  const autonomy =
    profile.riskTolerance === "hands_off" ? "ask_when_unsure" : "draft_only";

  const createdAgents: { id: string; templateSlug: string }[] = [];
  for (const slug of templateSlugs) {
    const template = templates.find((t) => t.slug === slug);
    if (!template) continue;
    const [agent] = await ctx.db
      .insert(agents)
      .values({
        workspaceId: ctx.workspace.id,
        templateId: template.id,
        name: AGENT_NAMES[slug] ?? template.roleTitle,
        roleTitle: template.roleTitle,
        jobDescription: template.jobDescription,
        status: "needs_setup",
        autonomyMode: autonomy,
        supervisorUserId: ctx.user.id,
      })
      .returning({ id: agents.id });
    createdAgents.push({ id: agent!.id, templateSlug: slug });
  }

  // Attach each template's default workflows as drafts (manual trigger).
  const wfTemplates = await ctx.db.select().from(workflowTemplates);
  for (const created of createdAgents) {
    const template = templates.find((t) => t.slug === created.templateSlug);
    const defaultSlugs = (template?.defaultWorkflowSlugs ?? []) as string[];
    for (const wfSlug of defaultSlugs.slice(0, 2)) {
      const wfTemplate = wfTemplates.find((w) => w.slug === wfSlug);
      if (!wfTemplate) continue;
      const [wf] = await ctx.db
        .insert(workflows)
        .values({
          workspaceId: ctx.workspace.id,
          templateId: wfTemplate.id,
          name: wfTemplate.name,
          instructions: wfTemplate.instructions,
          agentId: created.id,
          deliveryConfig: { target: "run_log" },
          approvalPolicy: wfTemplate.defaultApprovalPolicy ?? {},
          status: "draft",
        })
        .returning({ id: workflows.id });
      await ctx.db.insert(workflowTriggers).values({
        workspaceId: ctx.workspace.id,
        workflowId: wf!.id,
        triggerType: "manual",
        config: { type: "manual" },
      });
    }
  }

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "workspace.onboarded",
    payload: { ...profile, agentsCreated: createdAgents.length },
  });

  redirect(`/w/${workspaceSlug}`);
}
