"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { chatMessages, chatThreads } from "@augmentic/db";
import { chatMessageSchema } from "@augmentic/shared";
import { enqueueRun } from "@augmentic/engine";
import { requireWorkspace } from "../context";

// Chat rides the same engine + policy pipeline as workflows (Plan 1.14):
// each user message enqueues a chat-mode run; the reply is the run's output.
export async function sendChatMessageAction(
  workspaceSlug: string,
  agentId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "operator");
  const parsed = chatMessageSchema.parse({ message: formData.get("message") });

  let [thread] = await ctx.db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, ctx.workspace.id),
        eq(chatThreads.agentId, agentId),
        eq(chatThreads.userId, ctx.user.id),
      ),
    );
  if (!thread) {
    [thread] = await ctx.db
      .insert(chatThreads)
      .values({
        workspaceId: ctx.workspace.id,
        agentId,
        userId: ctx.user.id,
        title: parsed.message.slice(0, 60),
      })
      .returning();
  }

  const runId = await enqueueRun(ctx.db, {
    workspaceId: ctx.workspace.id,
    agentId,
    mode: "chat",
    triggerType: "manual",
    triggerSnapshot: {
      instructions: parsed.message,
      chatThreadId: thread!.id,
      requestedBy: ctx.user.email,
    },
  });

  await ctx.db.insert(chatMessages).values({
    workspaceId: ctx.workspace.id,
    threadId: thread!.id,
    role: "user",
    content: parsed.message,
    workflowRunId: runId,
  });

  revalidatePath(`/w/${workspaceSlug}/agents/${agentId}`);
}
