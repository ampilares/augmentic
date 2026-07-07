"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { mcpServers, secretRefs } from "@augmentic/db";
import { discoverMcpTools } from "@augmentic/connectors";
import { encryptSecret, recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

const addMcpSchema = z.object({
  name: z.string().trim().min(2).max(60),
  url: z.string().url().max(500),
  authToken: z.string().max(500).optional(),
});

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// Allowlist a trusted MCP server (Phase 4, Spec §7.2). Tools are discovered
// at registration; every call is approval-gated and payload-logged.
export async function addMcpServerAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const parsed = addMcpSchema.parse({
    name: formData.get("name"),
    url: formData.get("url"),
    authToken: (formData.get("authToken") as string) || undefined,
  });
  if (!parsed.url.startsWith("https://") && !parsed.url.includes("localhost") && !parsed.url.includes("127.0.0.1")) {
    throw new Error("MCP server URLs must use HTTPS.");
  }

  // Discovery doubles as a health check — registration fails loudly if the
  // server is unreachable or speaks the wrong protocol.
  const tools = await discoverMcpTools(parsed.url, parsed.authToken);
  if (tools.length === 0) throw new Error("MCP server exposes no tools.");

  let secretRefId: string | null = null;
  if (parsed.authToken) {
    const [secret] = await ctx.db
      .insert(secretRefs)
      .values({
        workspaceId: ctx.workspace.id,
        ciphertext: encryptSecret(JSON.stringify({ token: parsed.authToken })),
      })
      .returning({ id: secretRefs.id });
    secretRefId = secret!.id;
  }

  const slug = slugify(parsed.name);
  await ctx.db.insert(mcpServers).values({
    workspaceId: ctx.workspace.id,
    slug,
    name: parsed.name,
    url: parsed.url,
    secretRefId,
    toolsCache: tools,
    addedByUserId: ctx.user.id,
  });

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "mcp.server_added",
    payload: { name: parsed.name, url: parsed.url, tools: tools.map((t) => t.name) },
  });
  revalidatePath(`/w/${workspaceSlug}/integrations`);
}

export async function removeMcpServerAction(
  workspaceSlug: string,
  serverId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const [server] = await ctx.db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.workspaceId, ctx.workspace.id)));
  if (!server) return;
  if (server.secretRefId) {
    await ctx.db.delete(secretRefs).where(eq(secretRefs.id, server.secretRefId));
  }
  await ctx.db.delete(mcpServers).where(eq(mcpServers.id, serverId));
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "mcp.server_removed",
    payload: { name: server.name },
  });
  revalidatePath(`/w/${workspaceSlug}/integrations`);
}
