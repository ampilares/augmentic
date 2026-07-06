import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { agents, workflowRuns, workflows, workflowTriggers } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import {
  runWorkflowAction,
  setWorkflowStatusAction,
} from "@/lib/actions/workflow-actions";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ slug: string; workflowId: string }>;
}) {
  const { slug, workflowId } = await params;
  const ctx = await requireWorkspace(slug);

  const [wf] = await ctx.db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.workspaceId, ctx.workspace.id)));
  if (!wf) notFound();

  const [agent] = await ctx.db.select().from(agents).where(eq(agents.id, wf.agentId));
  const triggers = await ctx.db
    .select()
    .from(workflowTriggers)
    .where(eq(workflowTriggers.workflowId, wf.id));
  const runs = await ctx.db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, wf.id))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(15);

  const delivery = wf.deliveryConfig as { target?: string; slackChannel?: string; emailTo?: string };
  const needsSimulation = !wf.lastSimulatedAt && wf.status !== "active";
  const baseUrl = process.env.AUGMENTIC_BASE_URL ?? "http://localhost:3000";

  return (
    <div>
      <PageHeader
        title={wf.name}
        subtitle={`Owned by ${agent?.name ?? "unknown"} · delivery: ${(delivery.target ?? "run_log").replaceAll("_", " ")}`}
        action={<StatusBadge status={wf.status} />}
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card>
            <h3 className="mb-2 font-medium text-slate-900">Instructions</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{wf.instructions}</p>
          </Card>

          <Card>
            <h3 className="mb-3 font-medium text-slate-900">Runs</h3>
            {runs.length === 0 ? (
              <p className="text-sm text-slate-500">
                No runs yet. Simulate first to preview what this workflow will do.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <Link
                      href={`/w/${slug}/runs/${r.id}`}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      {r.mode === "simulation" ? "🧪 simulation" : r.triggerType} ·{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </Link>
                    <div className="flex items-center gap-3">
                      {r.costCents > 0 && (
                        <span className="text-xs text-slate-400">
                          ${(r.costCents / 100).toFixed(2)}
                        </span>
                      )}
                      <StatusBadge status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="mb-3 font-medium text-slate-900">Actions</h3>
            <div className="space-y-2">
              <form action={runWorkflowAction.bind(null, slug, wf.id, "simulation")}>
                <Button variant="secondary" type="submit" className="w-full justify-center">
                  🧪 Simulate (no side effects)
                </Button>
              </form>
              <form action={runWorkflowAction.bind(null, slug, wf.id, "live")}>
                <Button type="submit" className="w-full justify-center">
                  ▶ Run now
                </Button>
              </form>
              {wf.status !== "active" ? (
                <form action={setWorkflowStatusAction.bind(null, slug, wf.id, "active")}>
                  <Button
                    variant="secondary"
                    type="submit"
                    className="w-full justify-center"
                    title={needsSimulation ? "Tip: simulate before activating" : undefined}
                  >
                    Activate {needsSimulation ? "(simulate first — recommended)" : ""}
                  </Button>
                </form>
              ) : (
                <form action={setWorkflowStatusAction.bind(null, slug, wf.id, "paused")}>
                  <Button variant="secondary" type="submit" className="w-full justify-center">
                    Pause
                  </Button>
                </form>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-medium text-slate-900">Triggers</h3>
            {triggers.map((t) => (
              <div key={t.id} className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">{t.triggerType}</p>
                {t.triggerType === "schedule" && (
                  <p className="mt-1 text-xs text-slate-500">
                    cron: {(t.config as { schedule?: { cron?: string } }).schedule?.cron} (
                    {(t.config as { schedule?: { timezone?: string } }).schedule?.timezone})
                    <br />
                    {t.enabled && t.nextFireAt
                      ? `next: ${new Date(t.nextFireAt).toLocaleString()}`
                      : "fires when workflow is active"}
                  </p>
                )}
                {t.triggerType === "webhook" && t.webhookToken && (
                  <div className="mt-1 text-xs text-slate-500">
                    <p className="break-all">
                      POST {baseUrl}/api/hooks/{t.webhookToken}
                    </p>
                    <p className="mt-1">
                      Header: <code>X-Augmentic-Signature: HMAC-SHA256(body, secret)</code>
                      <br />
                      Secret: <code className="break-all">{t.webhookSecret}</code>
                    </p>
                  </div>
                )}
                {t.triggerType === "app_event" && (
                  <p className="mt-1 text-xs text-slate-500">
                    Gmail new-message poll · filter:{" "}
                    {(t.config as { filter?: string }).filter || "none"}
                  </p>
                )}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
