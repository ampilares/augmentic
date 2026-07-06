import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  agentSkills,
  agentTemplates,
  skills,
  toolDefinitions,
  toolPermissionPolicies,
  type Db,
} from "@augmentic/db";
import { TOOL_PERMISSION_SETTINGS } from "@augmentic/shared";

// Shared provisioning used by the hiring wizard, onboarding, and vertical
// pack install: enables a template's default skills and applies its approval
// policy defaults to the new agent.
export async function applyTemplateDefaults(
  db: Db,
  workspaceId: string,
  agentId: string,
  template: typeof agentTemplates.$inferSelect,
): Promise<void> {
  const skillSlugs = (template.defaultSkills ?? []) as string[];
  if (skillSlugs.length > 0) {
    const skillRows = await db
      .select({ id: skills.id, slug: skills.slug })
      .from(skills)
      .where(
        and(
          inArray(skills.slug, skillSlugs),
          or(isNull(skills.workspaceId), eq(skills.workspaceId, workspaceId)),
        ),
      );
    for (const skill of skillRows) {
      const existing = await db
        .select({ id: agentSkills.id })
        .from(agentSkills)
        .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skill.id)));
      if (existing.length === 0) {
        await db.insert(agentSkills).values({
          workspaceId,
          agentId,
          skillId: skill.id,
          enabled: true,
        });
      }
    }
  }

  const defaults = (template.approvalPolicyDefaults ?? {}) as Record<string, string>;
  for (const [toolName, setting] of Object.entries(defaults)) {
    if (!(TOOL_PERMISSION_SETTINGS as readonly string[]).includes(setting)) continue;
    const [def] = await db
      .select({ id: toolDefinitions.id })
      .from(toolDefinitions)
      .where(eq(toolDefinitions.name, toolName));
    if (!def) continue;
    const existing = await db
      .select({ id: toolPermissionPolicies.id })
      .from(toolPermissionPolicies)
      .where(
        and(
          eq(toolPermissionPolicies.agentId, agentId),
          eq(toolPermissionPolicies.toolDefinitionId, def.id),
        ),
      );
    if (existing.length === 0) {
      await db.insert(toolPermissionPolicies).values({
        workspaceId,
        agentId,
        toolDefinitionId: def.id,
        setting: setting as never,
      });
    }
  }
}
