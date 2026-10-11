import { eq, isNull } from "drizzle-orm";
import { TOOL_CATALOG } from "@augmentic/shared";
import type { Db } from "../client";
import { agentTemplates, skills, toolDefinitions, workflowTemplates } from "../schema";
import { AGENT_TEMPLATE_SEEDS } from "./agent-templates";
import { WORKFLOW_TEMPLATE_SEEDS } from "./workflow-templates";
import { SKILL_SEEDS } from "./skills";

// Idempotent: upserts built-in templates and tool definitions by slug/name.
// Runs on every boot, so it is read-mostly: one SELECT per table, batch
// INSERT for missing rows, and an UPDATE only when a row's seeded fields
// actually changed (steady-state boot touches nothing).

function changed(existing: Record<string, unknown>, values: Record<string, unknown>): boolean {
  return Object.entries(values).some(
    ([k, v]) => JSON.stringify(existing[k]) !== JSON.stringify(v),
  );
}

export async function seedBuiltins(db: Db) {
  const [toolRows, agentRows, workflowRows, skillRows] = await Promise.all([
    db.select().from(toolDefinitions),
    db.select().from(agentTemplates),
    db.select().from(workflowTemplates),
    db.select().from(skills).where(isNull(skills.workspaceId)),
  ]);

  const toolByName = new Map(toolRows.map((r) => [r.name, r]));
  const missingTools = TOOL_CATALOG.filter((t) => !toolByName.has(t.name));
  if (missingTools.length > 0) {
    await db.insert(toolDefinitions).values(
      missingTools.map((tool) => ({
        provider: tool.provider,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        riskTier: tool.riskTier,
      })),
    );
  }
  for (const tool of TOOL_CATALOG) {
    const existing = toolByName.get(tool.name);
    if (!existing) continue;
    const values = {
      provider: tool.provider,
      description: tool.description,
      inputSchema: tool.inputSchema,
      riskTier: tool.riskTier,
    };
    if (changed(existing, values)) {
      await db.update(toolDefinitions).set(values).where(eq(toolDefinitions.id, existing.id));
    }
  }

  const agentBySlug = new Map(agentRows.map((r) => [r.slug, r]));
  const agentValues = (t: (typeof AGENT_TEMPLATE_SEEDS)[number]) => ({
    roleTitle: t.roleTitle,
    shortPitch: t.shortPitch,
    jobDescription: t.jobDescription,
    defaultSkills: t.defaultSkills,
    appDependencies: t.appDependencies,
    defaultWorkflowSlugs: t.defaultWorkflowSlugs,
    approvalPolicyDefaults: t.approvalPolicyDefaults,
    setupQuestions: t.setupQuestions,
  });
  const missingAgents = AGENT_TEMPLATE_SEEDS.filter((t) => !agentBySlug.has(t.slug));
  if (missingAgents.length > 0) {
    await db
      .insert(agentTemplates)
      .values(missingAgents.map((t) => ({ slug: t.slug, ...agentValues(t) })));
  }
  for (const t of AGENT_TEMPLATE_SEEDS) {
    const existing = agentBySlug.get(t.slug);
    if (!existing) continue;
    const values = agentValues(t);
    if (changed(existing, values)) {
      await db.update(agentTemplates).set(values).where(eq(agentTemplates.id, existing.id));
    }
  }

  const workflowBySlug = new Map(workflowRows.map((r) => [r.slug, r]));
  const workflowValues = (w: (typeof WORKFLOW_TEMPLATE_SEEDS)[number]) => ({
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
  });
  const missingWorkflows = WORKFLOW_TEMPLATE_SEEDS.filter((w) => !workflowBySlug.has(w.slug));
  if (missingWorkflows.length > 0) {
    await db
      .insert(workflowTemplates)
      .values(missingWorkflows.map((w) => ({ slug: w.slug, ...workflowValues(w) })));
  }
  for (const w of WORKFLOW_TEMPLATE_SEEDS) {
    const existing = workflowBySlug.get(w.slug);
    if (!existing) continue;
    const values = workflowValues(w);
    if (changed(existing, values)) {
      await db
        .update(workflowTemplates)
        .set(values)
        .where(eq(workflowTemplates.id, existing.id));
    }
  }

  const skillBySlug = new Map(skillRows.map((r) => [r.slug, r]));
  const skillValues = (s: (typeof SKILL_SEEDS)[number]) => ({
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    allowedTools: s.allowedTools,
  });
  const missingSkills = SKILL_SEEDS.filter((s) => !skillBySlug.has(s.slug));
  if (missingSkills.length > 0) {
    await db
      .insert(skills)
      .values(missingSkills.map((s) => ({ slug: s.slug, workspaceId: null, ...skillValues(s) })));
  }
  for (const s of SKILL_SEEDS) {
    const existing = skillBySlug.get(s.slug);
    if (!existing) continue;
    const values = skillValues(s);
    if (changed(existing, values)) {
      await db.update(skills).set(values).where(eq(skills.id, existing.id));
    }
  }
}

export { AGENT_TEMPLATE_SEEDS, WORKFLOW_TEMPLATE_SEEDS, SKILL_SEEDS };
export {
  VERTICAL_PACKS,
  AGENCY_PACK,
  type VerticalPackSeed,
  type PackWorkflowSpec,
} from "./vertical-packs";
