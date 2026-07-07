"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { approvalLinks, approvalRequests } from "@augmentic/db";
import { decideApproval, recordAudit } from "@augmentic/engine";
import { approvalDecisionSchema } from "@augmentic/shared";
import { requireWorkspace } from "../context";

export async function decideApprovalAction(
  workspaceSlug: string,
  approvalRequestId: string,
  formData: FormData,
): Promise<void> {
  // Approver role is the minimum that can decide (RBAC, PRD §11).
  const ctx = await requireWorkspace(workspaceSlug, "approver");
  const editedRaw = formData.get("editedPayload") as string | null;
  let editedPayload: Record<string, unknown> | undefined;
  if (editedRaw && editedRaw.trim() !== "") {
    try {
      editedPayload = JSON.parse(editedRaw) as Record<string, unknown>;
    } catch {
      throw new Error("Edited payload must be valid JSON");
    }
  }
  const parsed = approvalDecisionSchema.parse({
    action: formData.get("action"),
    editedPayload,
    comment: (formData.get("comment") as string) || undefined,
  });
  await decideApproval(ctx.db, {
    workspaceId: ctx.workspace.id,
    approvalRequestId,
    action: parsed.action,
    decidedByUserId: ctx.user.id,
    decidedByLabel: ctx.user.email,
    editedPayload: parsed.editedPayload,
    comment: parsed.comment,
  });
  revalidatePath(`/w/${workspaceSlug}/approvals`);
}

// Client-safe approval link (FR-024): tokenized approval-only external view.
export async function createApprovalLinkAction(
  workspaceSlug: string,
  approvalRequestId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "approver");
  const recipientLabel = String(formData.get("recipientLabel") ?? "").trim();
  if (!recipientLabel) throw new Error("Recipient (client name or email) is required");
  const expiresDays = Math.min(
    30,
    Math.max(1, Math.floor(Number(formData.get("expiresDays") ?? 7)) || 7),
  );

  // Only pending approvals in this workspace can be shared.
  const [approval] = await ctx.db
    .select({ id: approvalRequests.id, status: approvalRequests.status })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.id, approvalRequestId),
        eq(approvalRequests.workspaceId, ctx.workspace.id),
      ),
    );
  if (!approval || approval.status !== "pending") {
    throw new Error("Approval not found or already decided");
  }

  await ctx.db.insert(approvalLinks).values({
    workspaceId: ctx.workspace.id,
    approvalRequestId,
    token: crypto.randomBytes(24).toString("base64url"),
    recipientLabel,
    createdByUserId: ctx.user.id,
    expiresAt: new Date(Date.now() + expiresDays * 86_400_000),
  });
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "approval_link.created",
    entityType: "approval_request",
    entityId: approvalRequestId,
    payload: { recipientLabel, expiresDays },
  });
  revalidatePath(`/w/${workspaceSlug}/approvals`);
}

export async function revokeApprovalLinkAction(
  workspaceSlug: string,
  linkId: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "approver");
  const revoked = await ctx.db
    .update(approvalLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(approvalLinks.id, linkId),
        eq(approvalLinks.workspaceId, ctx.workspace.id),
        isNull(approvalLinks.revokedAt),
      ),
    )
    .returning({ approvalRequestId: approvalLinks.approvalRequestId });
  if (revoked[0]) {
    await recordAudit(ctx.db, {
      workspaceId: ctx.workspace.id,
      actorType: "user",
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      eventType: "approval_link.revoked",
      entityType: "approval_request",
      entityId: revoked[0].approvalRequestId,
    });
  }
  revalidatePath(`/w/${workspaceSlug}/approvals`);
}
