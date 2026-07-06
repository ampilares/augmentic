"use server";

import { revalidatePath } from "next/cache";
import { decideApproval } from "@augmentic/engine";
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
