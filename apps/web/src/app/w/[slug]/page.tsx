import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  agents,
  approvalRequests,
  integrationConnections,
  memberships,
  usageLedgerEntries,
  users,
  workflowRuns,
  workflows,
  workflowTriggers,
} from "@augmentic/db";
import { CONNECTOR_PROVIDERS } from "@augmentic/shared";
import { requireWorkspace } from "@/lib/context";
import { WorkChart, type ChartData } from "@/components/WorkChart";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function WorkChartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const wsId = ctx.workspace.id;

  const [agentRows, workflowRows, triggerRows, connRows, memberRows, pendingRows] =
    await Promise.all([
      ctx.db.select().from(agents).where(eq(agents.workspaceId, wsId)),
      ctx.db.select().from(workflows).where(eq(workflows.workspaceId, wsId)),
      ctx.db.select().from(workflowTriggers).where(eq(workflowTriggers.workspaceId, wsId)),
      ctx.db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.workspaceId, wsId)),
      ctx.db
        .select({ userId: users.id, name: users.name, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.workspaceId, wsId)),
      ctx.db
        .select({ agentId: approvalRequests.agentId })
        .from(approvalRequests)
        .where(
          and(eq(approvalRequests.workspaceId, wsId), eq(approvalRequests.status, "pending")),
        ),
    ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const spendRows = await ctx.db
    .select({
      agentId: usageLedgerEntries.agentId,
      total: sql<number>`coalesce(sum(${usageLedgerEntries.costCents}), 0)`,
    })
    .from(usageLedgerEntries)
    .where(
      and(
        eq(usageLedgerEntries.workspaceId, wsId),
        gte(usageLedgerEntries.createdAt, monthStart),
      ),
    )
    .groupBy(usageLedgerEntries.agentId);
  const spendByAgent = new Map(spendRows.map((r) => [r.agentId, Number(r.total)]));

  const runStats = await ctx.db
    .select({
      status: workflowRuns.status,
      count: sql<number>`count(*)`,
    })
    .from(workflowRuns)
    .where(eq(workflowRuns.workspaceId, wsId))
    .groupBy(workflowRuns.status);

  const pendingByAgent: Record<string, number> = {};
  for (const p of pendingRows) {
    pendingByAgent[p.agentId] = (pendingByAgent[p.agentId] ?? 0) + 1;
  }

  const triggerByWorkflow = new Map(triggerRows.map((t) => [t.workflowId, t]));
  const connectedProviders = new Set(connRows.map((c) => c.provider));

  const chartData: ChartData = {
    slug,
    humans: memberRows.map((m) => ({
      id: m.userId,
      name: m.name,
      role: m.role,
      agentIds: agentRows
        .filter((a) => a.supervisorUserId === m.userId)
        .map((a) => a.id),
    })),
    agents: agentRows.map((a) => ({
      id: a.id,
      name: a.name,
      roleTitle: a.roleTitle,
      status: a.status,
      supervisorName:
        memberRows.find((m) => m.userId === a.supervisorUserId)?.name ?? null,
      apps: connRows.map((c) => c.provider),
      workflowNames: workflowRows.filter((w) => w.agentId === a.id).map((w) => w.name),
      pendingApprovals: pendingByAgent[a.id] ?? 0,
      spentCents: spendByAgent.get(a.id) ?? 0,
      capCents: a.spendCapMonthlyCents,
      autonomyMode: a.autonomyMode,
    })),
    workflows: workflowRows.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      agentId: w.agentId,
      triggerType: triggerByWorkflow.get(w.id)?.triggerType ?? "manual",
      deliveryTarget:
        ((w.deliveryConfig as { target?: string }).target ?? "run_log") as string,
    })),
    tools: CONNECTOR_PROVIDERS.filter((p) => connectedProviders.has(p.provider)).map(
      (p) => {
        const conn = connRows.find((c) => c.provider === p.provider)!;
        return {
          provider: p.provider,
          label: p.label,
          health: conn.healthStatus,
          isDemo: conn.isDemo,
          agentIds: agentRows.map((a) => a.id),
        };
      },
    ),
    pendingApprovalsByAgent: pendingByAgent,
  };

  const statOf = (s: string) =>
    Number(runStats.find((r) => r.status === s)?.count ?? 0);

  return (
    <div>
      <PageHeader
        title="Work Chart"
        subtitle="Who does what, what's automated, and what needs your approval."
        action={<LinkButton href={`/w/${slug}/agents/hire`}>+ Hire AI employee</LinkButton>}
      />

      <div className="mb-8 grid grid-cols-4 gap-4">
        <StatCard label="AI employees" value={agentRows.length} />
        <StatCard label="Active workflows" value={workflowRows.filter((w) => w.status === "active").length} />
        <StatCard
          label="Pending approvals"
          value={pendingRows.length}
          href={`/w/${slug}/approvals`}
          highlight={pendingRows.length > 0}
        />
        <StatCard label="Completed runs" value={statOf("succeeded")} href={`/w/${slug}/runs`} />
      </div>

      {agentRows.length === 0 ? (
        <EmptyState
          title="Your work chart is empty"
          hint="Answer five quick questions and we'll propose your first AI employees — or hire one directly from a template."
          action={
            <div className="flex gap-3">
              <LinkButton href={`/w/${slug}/onboarding`}>Set up my AI team</LinkButton>
              <LinkButton href={`/w/${slug}/agents/hire`} variant="secondary">
                Hire from a template
              </LinkButton>
            </div>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-6">
          <WorkChart data={chartData} />
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number;
  href?: string;
  highlight?: boolean;
}) {
  const inner = (
    <Card className={highlight ? "border-amber-300 bg-amber-50" : ""}>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
