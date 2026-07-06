import { and, eq } from "drizzle-orm";
import { artifacts, runSteps, workflowRuns } from "@augmentic/db";
import { getWorkspaceContext } from "@/lib/context";

export const dynamic = "force-dynamic";

// SSE stream of run state. Polls the DB (engine state of record) and pushes a
// frame whenever anything changes; closes on terminal status.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; runId: string }> },
) {
  const { slug, runId } = await params;
  const ctx = await getWorkspaceContext(slug);
  if (!ctx) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const terminal = ["succeeded", "failed", "cancelled", "blocked"];

  const stream = new ReadableStream({
    async start(controller) {
      let lastPayload = "";
      let closed = false;
      const send = async () => {
        if (closed) return;
        const [run] = await ctx.db
          .select()
          .from(workflowRuns)
          .where(
            and(eq(workflowRuns.id, runId), eq(workflowRuns.workspaceId, ctx.workspace.id)),
          );
        if (!run) {
          controller.close();
          closed = true;
          return;
        }
        const [steps, arts] = await Promise.all([
          ctx.db
            .select()
            .from(runSteps)
            .where(eq(runSteps.workflowRunId, runId))
            .orderBy(runSteps.seq),
          ctx.db.select().from(artifacts).where(eq(artifacts.workflowRunId, runId)),
        ]);
        const payload = JSON.stringify({
          status: run.status,
          statusReason: run.statusReason,
          costCents: run.costCents,
          steps: steps.map((s) => ({
            id: s.id,
            seq: s.seq,
            stepType: s.stepType,
            status: s.status,
            title: s.title,
            input: s.input,
            output: s.output,
            error: s.error,
            durationMs: s.durationMs,
            costCents: s.costCents,
          })),
          artifacts: arts.map((a) => ({ id: a.id, title: a.title, content: a.content })),
        });
        if (payload !== lastPayload) {
          lastPayload = payload;
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }
        if (terminal.includes(run.status)) {
          controller.close();
          closed = true;
        }
      };
      await send();
      const interval = setInterval(async () => {
        try {
          await send();
        } catch {
          clearInterval(interval);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        }
        if (closed) clearInterval(interval);
      }, 700);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
