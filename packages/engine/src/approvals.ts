import {
  approvalRequests,
  toolCalls,
  workflowRuns,
  type Db,
} from "@augmentic/db";
import { TOOL_CATALOG_BY_NAME } from "@augmentic/shared";
import { validateToolArgs } from "@augmentic/policy";
import { and, eq } from "drizzle-orm";
import { recordActivationMetric, recordAudit } from "./audit";
import type { ResumeState } from "./pipeline";

export interface DecisionInput {
  workspaceId: string;
  approvalRequestId: string;
  action: "approve" | "reject" | "edit" | "request_revision";
  // null for external client-safe-link deciders; decidedByLabel then carries
  // the link label/token reference for the audit trail (FR-024).
  decidedByUserId: string | null;
  decidedByLabel: string;
  editedPayload?: Record<string, unknown>;
  comment?: string;
}

// Approval lifecycle (Journey D): the paused run resumes from saved state —
// minutes or days later — and executes exactly the approved payload.
export async function decideApproval(db: Db, input: DecisionInput): Promise<void> {
  const [approval] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.id, input.approvalRequestId),
        eq(approvalRequests.workspaceId, input.workspaceId),
      ),
    );
  if (!approval) throw new Error("Approval request not found");
  if (approval.status !== "pending") throw new Error(`Approval already ${approval.status}`);

  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, approval.workflowRunId));
  if (!run) throw new Error("Run not found for approval");
  const state = (run.resumeState ?? {}) as ResumeState;
  const actions = state.actions ?? [];
  const actionIdx = actions.findIndex(
    (a) => a.approvalRequestId === input.approvalRequestId,
  );

  let newStatus: "approved" | "rejected" | "edited" | "revision_requested";
  switch (input.action) {
    case "approve":
      newStatus = "approved";
      break;
    case "edit": {
      if (!input.editedPayload) throw new Error("edit requires editedPayload");
      const spec = TOOL_CATALOG_BY_NAME[approval.requestedAction];
      if (spec) {
        const v = validateToolArgs(spec.inputSchema, input.editedPayload);
        if (!v.ok) throw new Error(`Edited payload invalid: ${v.errors.join("; ")}`);
      }
      newStatus = "edited";
      break;
    }
    case "reject":
      newStatus = "rejected";
      break;
    case "request_revision":
      newStatus = "revision_requested";
      break;
  }

  await db
    .update(approvalRequests)
    .set({
      status: newStatus,
      decidedByUserId: input.decidedByUserId,
      decidedAt: new Date(),
      decisionNote: input.comment,
      editedPayload: input.editedPayload ?? null,
      updatedAt: new Date(),
    })
    .where(eq(approvalRequests.id, input.approvalRequestId));

  await recordAudit(db, {
    workspaceId: input.workspaceId,
    actorType: "user",
    actorId: input.decidedByUserId,
    actorLabel: input.decidedByLabel,
    eventType: `approval.${newStatus}`,
    entityType: "approval_request",
    entityId: input.approvalRequestId,
    payload: {
      tool: approval.requestedAction,
      comment: input.comment,
      edited: Boolean(input.editedPayload),
    },
  });
  await recordActivationMetric(db, input.workspaceId, "first_approval_completed");

  // Update durable state and re-queue the run so the worker resumes it.
  if (input.action === "request_revision") {
    state.phase = "redraft";
    state.revisionFeedback = input.comment ?? "Please revise your proposal.";
    if (actionIdx >= 0) actions[actionIdx]!.status = "rejected";
  } else if (actionIdx >= 0) {
    if (input.action === "reject") {
      actions[actionIdx]!.status = "rejected";
      // Cancel the associated pending tool call record.
      const tc = await db
        .select({ id: toolCalls.id })
        .from(toolCalls)
        .where(eq(toolCalls.approvalRequestId, input.approvalRequestId));
      if (tc[0]) {
        await db
          .update(toolCalls)
          .set({ error: "Rejected by approver" })
          .where(eq(toolCalls.id, tc[0].id));
      }
    } else {
      actions[actionIdx]!.status = "approved";
    }
    // Continue the action loop from this action.
    state.actionIndex = actionIdx;
    state.phase = "actions";
  }

  await db
    .update(workflowRuns)
    .set({
      resumeState: state as never,
      status: "queued",
      lockedBy: null,
      lockedAt: null,
      statusReason: null,
      updatedAt: new Date(),
    })
    .where(eq(workflowRuns.id, run.id));
}
