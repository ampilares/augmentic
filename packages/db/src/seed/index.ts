import { eq } from "drizzle-orm";
import { TOOL_CATALOG } from "@augmentic/shared";
import type { Db } from "../client";
import { agentTemplates, toolDefinitions, workflowTemplates } from "../schema";
import { AGENT_TEMPLATE_SEEDS } from "./agent-templates";
import { WORKFLOW_TEMPLATE_SEEDS } from "./workflow-templates";

// Idempotent: upserts built-in templates and tool definitions by slug/name.
// Safe to run on every boot.
export async function seedBuiltins(db: Db) {
  for (const tool of TOOL_CATALOG) {
    const existing = await db
      .select({ id: toolDefinitions.id })
      .from(toolDefinitions)
      .where(eq(toolDefinitions.name, tool.name));
    if (existing.length === 0) {
      await db.insert(toolDefinitions).values({
        provider: tool.provider,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        riskTier: tool.riskTier,
      });
    } else {
      await db
        .update(toolDefinitions)
        .set({
          description: tool.description,
          inputSchema: tool.inputSchema,
          riskTier: tool.riskTier,
          provider: tool.provider,
        })
        .where(eq(toolDefinitions.name, tool.name));
    }
  }

  for (const t of AGENT_TEMPLATE_SEEDS) {
    const existing = await db
      .select({ id: agentTemplates.id })
      .from(agentTemplates)
      .where(eq(agentTemplates.slug, t.slug));
    const values = {
      roleTitle: t.roleTitle,
      shortPitch: t.shortPitch,
      jobDescription: t.jobDescription,
      defaultSkills: t.defaultSkills,
      appDependencies: t.appDependencies,
      defaultWorkflowSlugs: t.defaultWorkflowSlugs,
      approvalPolicyDefaults: t.approvalPolicyDefaults,
      setupQuestions: t.setupQuestions,
    };
    if (existing.length === 0) {
      await db.insert(agentTemplates).values({ slug: t.slug, ...values });
    } else {
      await db
        .update(agentTemplates)
        .set(values)
        .where(eq(agentTemplates.slug, t.slug));
    }
  }

  for (const w of WORKFLOW_TEMPLATE_SEEDS) {
    const existing = await db
      .select({ id: workflowTemplates.id })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.slug, w.slug));
    const values = {
      category: w.category,
      name: w.name,
      description: w.description,
      instructions: w.instructions,
      dependencies: w.dependencies,
      sampleOutput: w.sampleOutput,
      triggerOptions: w.triggerOptions,
      defaultRoleSlug: w.defaultRoleSlug,
      requiredScopes: w.requiredScopes,
      defaultApprovalPolicy: w.defaultApprovalPolicy,
      successMetric: w.successMetric,
    };
    if (existing.length === 0) {
      await db.insert(workflowTemplates).values({ slug: w.slug, ...values });
    } else {
      await db
        .update(workflowTemplates)
        .set(values)
        .where(eq(workflowTemplates.slug, w.slug));
    }
  }
}

export { AGENT_TEMPLATE_SEEDS, WORKFLOW_TEMPLATE_SEEDS };
