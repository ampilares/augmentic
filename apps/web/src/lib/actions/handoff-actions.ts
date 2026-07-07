"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { agents, orgEdges, orgNodes } from "@augmentic/db";
import { recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

async function ensureAgentNode(
  db: Awaited<ReturnType<typeof requireWorkspace>>["db"],
  workspaceId: string,
  agentId: string,
  label: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: orgNodes.id })
    .from(orgNodes)
    .where(
      and(
        eq(orgNodes.workspaceId, workspaceId),
        eq(orgNodes.nodeType, "agent"),
        eq(orgNodes.refId, agentId),
      ),
    );
  if (existing) return existing.id;
  const [created] = await db
    .insert(orgNodes)
    .values({ workspaceId, nodeType: "agent", refId: agentId, label })
    .returning({ id: orgNodes.id });
  return created!.id;
}

// Configure which agents this agent may hand work off to (Phase 4). The
// hands_off org edges are the deterministic per-hop policy the engine checks.
export async function setHandoffRoutesAction(
  workspaceSlug: string,
  agentId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const targetIds = formData.getAll("targets").map(String);

  const workspaceAgents = await ctx.db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(eq(agents.workspaceId, ctx.workspace.id));
  const validIds = new Set(workspaceAgents.map((a) => a.id));
  const source = workspaceAgents.find((a) => a.id === agentId);
  if (!source) throw new Error("Agent not found");

  const fromNodeId = await ensureAgentNode(ctx.db, ctx.workspace.id, agentId, source.name);

  // Replace this agent's outgoing hands_off edges with the new set.
  const existingEdges = await ctx.db
    .select()
    .from(orgEdges)
    .where(
      and(
        eq(orgEdges.workspaceId, ctx.workspace.id),
        eq(orgEdges.edgeType, "hands_off"),
        eq(orgEdges.fromNodeId, fromNodeId),
      ),
    );
  for (const edge of existingEdges) {
    await ctx.db.delete(orgEdges).where(eq(orgEdges.id, edge.id));
  }
  const applied: string[] = [];
  for (const targetId of targetIds) {
    if (!validIds.has(targetId) || targetId === agentId) continue;
    const target = workspaceAgents.find((a) => a.id === targetId)!;
    const toNodeId = await ensureAgentNode(ctx.db, ctx.workspace.id, targetId, target.name);
    await ctx.db.insert(orgEdges).values({
      workspaceId: ctx.workspace.id,
      fromNodeId,
      toNodeId,
      edgeType: "hands_off",
    });
    applied.push(target.name);
  }

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "agent.handoff_routes_changed",
    entityType: "agent",
    entityId: agentId,
    payload: { canHandOffTo: applied },
  });
  revalidatePath(`/w/${workspaceSlug}/agents/${agentId}`);
  revalidatePath(`/w/${workspaceSlug}`);
}
