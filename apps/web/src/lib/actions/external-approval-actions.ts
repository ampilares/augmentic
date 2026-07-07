"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { approvalLinks, approvalRequests } from "@augmentic/db";
import { decideApproval } from "@augmentic/engine";
import { getBootedDb } from "../boot";

// External (client-link) approval decision — FR-024. No session: the token
// IS the credential, so every guard the link creation promised is re-checked
// here at decision time.

export interface ExternalLinkContext {
  linkId: string;
  workspaceId: string;
  approvalRequestId: string;
  recipientLabel: string;
}

export async function loadValidLink(token: string): Promise<
  | { ok: true; ctx: ExternalLinkContext }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "decided" }
> {
  const db = await getBootedDb();
  const [link] = await db
    .select()
    .from(approvalLinks)
    .where(eq(approvalLinks.token, token));
  if (!link) return { ok: false, reason: "not_found" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt < new Date()) return { ok: false, reason: "expired" };
  const [approval] = await db
    .select({ status: approvalRequests.status })
    .from(approvalRequests)
    .where(eq(approvalRequests.id, link.approvalRequestId));
  if (!approval) return { ok: false, reason: "not_found" };
  if (approval.status !== "pending") return { ok: false, reason: "decided" };
  return {
    ok: true,
    ctx: {
      linkId: link.id,
      workspaceId: link.workspaceId,
      approvalRequestId: link.approvalRequestId,
      recipientLabel: link.recipientLabel,
    },
  };
}

export async function decideExternalApprovalAction(
  token: string,
  formData: FormData,
): Promise<void> {
  const valid = await loadValidLink(token);
  if (!valid.ok) throw new Error("This approval link is no longer valid.");
  const action = String(formData.get("action"));
  if (action !== "approve" && action !== "reject") {
    // External reviewers get approve/reject only — no payload editing and no
    // revision loop through an unauthenticated surface.
    throw new Error("Unsupported action");
  }
  const db = await getBootedDb();
  await decideApproval(db, {
    workspaceId: valid.ctx.workspaceId,
    approvalRequestId: valid.ctx.approvalRequestId,
    action,
    decidedByUserId: null,
    decidedByLabel: `${valid.ctx.recipientLabel} (client link)`,
    actorType: "external",
    comment: String(formData.get("comment") ?? "").trim() || undefined,
  });
  await db
    .update(approvalLinks)
    .set({ usedAt: new Date() })
    .where(eq(approvalLinks.id, valid.ctx.linkId));
  revalidatePath(`/approve/${token}`);
}
