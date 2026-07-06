import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import {
  agents,
  approvalRequests,
  artifacts,
  runSteps,
  workflowRuns,
  workflows,
} from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { RunStepsLive } from "@/components/RunStepsLive";
import { Card, PageHeader, StatusBadge } from "@/components/ui";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ slug: string; runId: string }>;
}) {
  const { slug, runId } = await params;
  const ctx = await requireWorkspace(slug);

  const [run] = await ctx.db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.workspaceId, ctx.workspace.id)));
  if (!run) notFound();

  const [wf] = run.workflowId
    ? await ctx.db.select().from(workflows).where(eq(workflows.id, run.workflowId))
    : [null];
  const [agent] = await ctx.db.select().from(agents).where(eq(agents.id, run.agentId));

  const [steps, arts, approvals] = await Promise.all([
    ctx.db
      .select()
      .from(runSteps)
      .where(eq(runSteps.workflowRunId, run.id))
      .orderBy(runSteps.seq),
    ctx.db.select().from(artifacts).where(eq(artifacts.workflowRunId, run.id)),
    ctx.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.workflowRunId, run.id)),
  ]);

  return (
    <div>
      <PageHeader
        title={wf?.name ?? (run.mode === "chat" ? "Chat task" : "Ad-hoc run")}
        subtitle={`${run.mode} run by ${agent?.name ?? "?"} · triggered via ${run.triggerType} · ${new Date(run.createdAt).toLocaleString()}`}
      />

      {run.mode === "simulation" && (
        <Card className="mb-6 border-purple-200 bg-purple-50">
          <p className="text-sm text-purple-800">
            🧪 <strong>Simulation:</strong> no external side effects executed. Actions that would
            need approval are marked below so you know exactly what a live run will ask.
          </p>
        </Card>
      )}

      {approvals.filter((a) => a.status === "pending").length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            ⏸ This run is waiting on{" "}
            {approvals.filter((a) => a.status === "pending").length} approval(s).{" "}
            <Link href={`/w/${slug}/approvals`} className="font-medium underline">
              Review in the Approval Center →
            </Link>
          </p>
        </Card>
      )}

      <RunStepsLive
        streamUrl={`/api/workspaces/${slug}/runs/${run.id}/stream`}
        initial={{
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
        }}
      />

      {approvals.length > 0 && (
        <Card className="mt-6">
          <h3 className="mb-3 font-medium text-slate-900">Approvals in this run</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {approvals.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span className="text-slate-700">{a.requestedAction}</span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
