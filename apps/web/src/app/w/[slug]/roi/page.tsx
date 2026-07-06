import { and, eq, gte, sql } from "drizzle-orm";
import {
  agents,
  approvalRequests,
  usageLedgerEntries,
  workflowRuns,
  workflows,
  workflowTemplates,
} from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, PageHeader } from "@/components/ui";

// Time-saved estimate per completed run, by template category (minutes).
// Deliberately conservative; refined with beta data (PRD open question #5).
const MINUTES_SAVED_BY_CATEGORY: Record<string, number> = {
  Inbox: 15,
  Calendar: 20,
  "Follow-ups": 15,
  Sales: 20,
  Finance: 20,
  "Client success": 30,
  Support: 15,
  Marketing: 45,
  Operations: 10,
};
const DEFAULT_MINUTES_SAVED = 15;

export default async function RoiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const wsId = ctx.workspace.id;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [runs, approvals, spendRow, agentRows] = await Promise.all([
    ctx.db
      .select({
        run: workflowRuns,
        workflowName: workflows.name,
        category: workflowTemplates.category,
      })
      .from(workflowRuns)
      .leftJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
      .leftJoin(workflowTemplates, eq(workflows.templateId, workflowTemplates.id))
      .where(
        and(eq(workflowRuns.workspaceId, wsId), gte(workflowRuns.createdAt, monthStart)),
      ),
    ctx.db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, wsId),
          gte(approvalRequests.createdAt, monthStart),
        ),
      ),
    ctx.db
      .select({ total: sql<number>`coalesce(sum(${usageLedgerEntries.costCents}), 0)` })
      .from(usageLedgerEntries)
      .where(
        and(
          eq(usageLedgerEntries.workspaceId, wsId),
          gte(usageLedgerEntries.createdAt, monthStart),
        ),
      ),
    ctx.db.select().from(agents).where(eq(agents.workspaceId, wsId)),
  ]);

  const liveRuns = runs.filter((r) => r.run.mode === "live");
  const completed = liveRuns.filter((r) => r.run.status === "succeeded");
  const failed = liveRuns.filter((r) => r.run.status === "failed");
  const completionRate =
    liveRuns.length > 0 ? Math.round((completed.length / liveRuns.length) * 100) : null;

  const minutesSaved = completed.reduce((acc, r) => {
    const minutes = r.category
      ? (MINUTES_SAVED_BY_CATEGORY[r.category] ?? DEFAULT_MINUTES_SAVED)
      : DEFAULT_MINUTES_SAVED;
    return acc + minutes;
  }, 0);
  const hoursSaved = minutesSaved / 60;

  const decided = approvals.filter((a) => a.status !== "pending");
  const accepted = decided.filter((a) => ["approved", "edited"].includes(a.status));
  const edited = decided.filter((a) => a.status === "edited");
  const acceptanceRate =
    decided.length > 0 ? Math.round((accepted.length / decided.length) * 100) : null;
  const editRate =
    accepted.length > 0 ? Math.round((edited.length / accepted.length) * 100) : null;

  const spendCents = Number(spendRow[0]?.total ?? 0);
  const costPerCompleted =
    completed.length > 0 ? spendCents / completed.length / 100 : null;

  // Per-workflow rollup
  const byWorkflow = new Map<string, { name: string; completed: number; category: string | null }>();
  for (const r of completed) {
    const key = r.run.workflowId ?? "adhoc";
    const entry = byWorkflow.get(key) ?? {
      name: r.workflowName ?? "Ad-hoc / chat tasks",
      completed: 0,
      category: r.category,
    };
    entry.completed += 1;
    byWorkflow.set(key, entry);
  }

  return (
    <div>
      <PageHeader
        title="ROI"
        subtitle={`Work completed and value created this month across ${agentRows.length} AI employee${agentRows.length === 1 ? "" : "s"}.`}
      />
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Stat value={completed.length} label="work items completed" />
        <Stat
          value={hoursSaved >= 1 ? `${hoursSaved.toFixed(1)}h` : `${minutesSaved}m`}
          label="estimated time saved"
        />
        <Stat
          value={`$${(spendCents / 100).toFixed(2)}`}
          label="AI spend"
        />
        <Stat
          value={costPerCompleted !== null ? `$${costPerCompleted.toFixed(2)}` : "—"}
          label="cost per completed workflow"
        />
      </div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat value={completionRate !== null ? `${completionRate}%` : "—"} label="workflow completion rate" />
        <Stat value={acceptanceRate !== null ? `${acceptanceRate}%` : "—"} label="approval acceptance rate" />
        <Stat value={editRate !== null ? `${editRate}%` : "—"} label="human edit rate" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="mb-3 font-medium text-slate-900">Completed by workflow</h3>
          {byWorkflow.size === 0 ? (
            <p className="text-sm text-slate-500">
              No completed live runs yet this month. Activate a workflow to start creating
              value.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {[...byWorkflow.values()]
                .sort((a, b) => b.completed - a.completed)
                .map((w) => (
                  <li key={w.name} className="flex justify-between py-2">
                    <span className="text-slate-700">{w.name}</span>
                    <span className="text-slate-500">
                      {w.completed} run{w.completed === 1 ? "" : "s"} · ~
                      {(
                        (w.completed *
                          (w.category
                            ? (MINUTES_SAVED_BY_CATEGORY[w.category] ?? DEFAULT_MINUTES_SAVED)
                            : DEFAULT_MINUTES_SAVED)) /
                        60
                      ).toFixed(1)}
                      h saved
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 font-medium text-slate-900">Reliability this month</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>
              {completed.length} succeeded · {failed.length} failed ·{" "}
              {liveRuns.filter((r) => r.run.status === "waiting_approval").length} waiting on
              approval
            </li>
            <li>
              {decided.length} approvals decided ({accepted.length} accepted,{" "}
              {decided.length - accepted.length} rejected/revised)
            </li>
            <li className="text-xs text-slate-400">
              Time-saved estimates are conservative per-category defaults; they'll be
              calibrated against your real workflows.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <Card>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </Card>
  );
}
