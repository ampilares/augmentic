import { workflowRuns, workflows, type Db } from "@augmentic/db";
import type { RunMode, TriggerType } from "@augmentic/shared";
import { eq } from "drizzle-orm";

export interface EnqueueInput {
  workspaceId: string;
  workflowId?: string | null;
  agentId?: string;
  mode?: RunMode;
  triggerType: TriggerType;
  triggerSnapshot?: Record<string, unknown>;
  // Chat/ad-hoc runs carry their instructions in the snapshot.
}

export async function enqueueRun(db: Db, input: EnqueueInput): Promise<string> {
  let agentId = input.agentId;
  if (!agentId) {
    if (!input.workflowId) throw new Error("enqueueRun: agentId or workflowId required");
    const [wf] = await db
      .select({ agentId: workflows.agentId })
      .from(workflows)
      .where(eq(workflows.id, input.workflowId));
    if (!wf) throw new Error("enqueueRun: workflow not found");
    agentId = wf.agentId;
  }
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workspaceId: input.workspaceId,
      workflowId: input.workflowId ?? null,
      agentId,
      mode: input.mode ?? "live",
      triggerType: input.triggerType,
      triggerSnapshot: input.triggerSnapshot ?? {},
      status: "queued",
    })
    .returning({ id: workflowRuns.id });
  return run!.id;
}
