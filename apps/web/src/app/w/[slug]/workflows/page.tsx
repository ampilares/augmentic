import Link from "next/link";
import { eq } from "drizzle-orm";
import { agents, workflows, workflowTriggers } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export default async function WorkflowsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const rows = await ctx.db
    .select({
      wf: workflows,
      agentName: agents.name,
    })
    .from(workflows)
    .innerJoin(agents, eq(workflows.agentId, agents.id))
    .where(eq(workflows.workspaceId, ctx.workspace.id));
  const triggers = await ctx.db
    .select()
    .from(workflowTriggers)
    .where(eq(workflowTriggers.workspaceId, ctx.workspace.id));
  const triggerByWf = new Map(triggers.map((t) => [t.workflowId, t]));

  return (
    <div>
      <PageHeader
        title="Workflows"
        subtitle="Recurring work in plain language: instructions, a trigger, an owner, and a destination."
        action={<LinkButton href={`/w/${slug}/workflows/new`}>+ New workflow</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          hint="Start from a template — inbox digest, invoice chaser, weekly report — or write your own."
          action={<LinkButton href={`/w/${slug}/workflows/new`}>Browse templates</LinkButton>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ wf, agentName }) => {
            const t = triggerByWf.get(wf.id);
            return (
              <Link key={wf.id} href={`/w/${slug}/workflows/${wf.id}`} className="block">
                <Card className="flex items-center justify-between transition-colors hover:border-brand-500">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{wf.name}</p>
                    <p className="line-clamp-1 text-sm text-slate-500">{wf.instructions}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      owner: {agentName} · trigger: {t?.triggerType ?? "manual"}
                      {wf.lastSimulatedAt ? " · simulated ✓" : ""}
                    </p>
                  </div>
                  <StatusBadge status={wf.status} />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
