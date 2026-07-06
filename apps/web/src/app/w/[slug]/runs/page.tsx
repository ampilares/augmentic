import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { agents, workflowRuns, workflows } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export default async function RunsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const rows = await ctx.db
    .select({
      run: workflowRuns,
      workflowName: workflows.name,
      agentName: agents.name,
    })
    .from(workflowRuns)
    .leftJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
    .innerJoin(agents, eq(workflowRuns.agentId, agents.id))
    .where(eq(workflowRuns.workspaceId, ctx.workspace.id))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(50);

  return (
    <div>
      <PageHeader title="Runs" subtitle="Every run with its full step trace, cost, and outcome." />
      {rows.length === 0 ? (
        <EmptyState title="No runs yet" hint="Run or simulate a workflow to see step traces here." />
      ) : (
        <div className="space-y-2">
          {rows.map(({ run, workflowName, agentName }) => (
            <Link key={run.id} href={`/w/${slug}/runs/${run.id}`} className="block">
              <Card className="flex items-center justify-between !p-4 transition-colors hover:border-brand-500">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {workflowName ?? (run.mode === "chat" ? "Chat task" : "Ad-hoc task")}
                    <span className="ml-2 text-xs text-slate-400">by {agentName}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {run.triggerType} · {new Date(run.createdAt).toLocaleString()}
                    {run.costCents > 0 && ` · $${(run.costCents / 100).toFixed(2)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {run.mode !== "live" && <StatusBadge status={run.mode} />}
                  <StatusBadge status={run.status} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
