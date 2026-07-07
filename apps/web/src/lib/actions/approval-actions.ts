"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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

// Create a client-safe approval link (FR-024): approval-only external view,
// expiring, no workspace access. Approver+ can share.
export async function createApprovalLinkAction(
  workspaceSlug: string,
  approvalRequestId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "approver");
  const [approval] = await ctx.db
    .select({ id: approvalRequests.id, status: approvalRequests.status })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.id, approvalRequestId),
        eq(approvalRequests.workspaceId, ctx.workspace.id),
      ),
    );
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "pending") throw new Error("Approval already decided");
  const label = (String(formData.get("label") ?? "").trim() || null) as string | null;
  await ctx.db.insert(approvalLinks).values({
    workspaceId: ctx.workspace.id,
    approvalRequestId,
    token: crypto.randomBytes(24).toString("hex"),
    label,
    createdByUserId: ctx.user.id,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "approval_link.created",
    entityType: "approval_request",
    entityId: approvalRequestId,
    payload: { label, expiresInDays: 7 },
  });
  revalidatePath(`/w/${workspaceSlug}/approvals`);
}
