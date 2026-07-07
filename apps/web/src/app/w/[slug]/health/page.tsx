import Link from "next/link";
import { and, eq, gte, inArray } from "drizzle-orm";
import {
  agentTemplates,
  agents,
  approvalRequests,
  brandProfiles,
  integrationConnections,
  knowledgeItems,
  workflowRuns,
  workflowTemplates,
  workflowTriggers,
  workflows,
} from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, EmptyState, PageHeader } from "@/components/ui";

// Workspace health report (plan 3.5): the setup-diagnostics surface behind
// the managed-implementation offer — "Gmail connected, calendar permission
// missing, CRM field mapping needs review" style findings, each with a fix
// link. Everything is computed live from workspace state.

type Severity = "error" | "warn" | "info";

interface Finding {
  severity: Severity;
  area: string;
  message: string;
  href: string;
  cta: string;
}

const SEVERITY_STYLE: Record<Severity, { badge: string; label: string }> = {
  error: { badge: "bg-red-100 text-red-700", label: "Fix" },
  warn: { badge: "bg-amber-100 text-amber-800", label: "Review" },
  info: { badge: "bg-slate-100 text-slate-600", label: "Consider" },
};

export default async function HealthPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const wsId = ctx.workspace.id;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [
    connections,
    agentRows,
    workflowRows,
    triggerRows,
    recentRuns,
    pendingApprovals,
    knowledgeCount,
    brandRows,
  ] = await Promise.all([
    ctx.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.workspaceId, wsId)),
    ctx.db
      .select({ agent: agents, templateDeps: agentTemplates.appDependencies })
      .from(agents)
      .leftJoin(agentTemplates, eq(agents.templateId, agentTemplates.id))
      .where(eq(agents.workspaceId, wsId)),
    ctx.db
      .select({ workflow: workflows, templateDeps: workflowTemplates.dependencies })
      .from(workflows)
      .leftJoin(workflowTemplates, eq(workflows.templateId, workflowTemplates.id))
      .where(eq(workflows.workspaceId, wsId)),
    ctx.db.select().from(workflowTriggers).where(eq(workflowTriggers.workspaceId, wsId)),
    ctx.db
      .select({ status: workflowRuns.status, workflowId: workflowRuns.workflowId })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, wsId),
          eq(workflowRuns.mode, "live"),
          gte(workflowRuns.createdAt, weekAgo),
        ),
      ),
    ctx.db
      .select({ id: approvalRequests.id, createdAt: approvalRequests.createdAt })
      .from(approvalRequests)
      .where(
        and(eq(approvalRequests.workspaceId, wsId), eq(approvalRequests.status, "pending")),
      ),
    ctx.db
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.workspaceId, wsId)),
    ctx.db.select().from(brandProfiles).where(eq(brandProfiles.workspaceId, wsId)),
  ]);

  const findings: Finding[] = [];
  const connectedProviders = new Set(connections.map((c) => c.provider));

  // Integrations ------------------------------------------------------------
  const wantedProviders = new Set<string>();
  for (const { templateDeps } of agentRows) {
    for (const dep of (templateDeps as string[] | null) ?? []) wantedProviders.add(dep);
  }
  for (const { templateDeps } of workflowRows) {
    for (const dep of (templateDeps as string[] | null) ?? []) wantedProviders.add(dep);
  }
  for (const provider of wantedProviders) {
    if (!connectedProviders.has(provider)) {
      findings.push({
        severity: "error",
        area: "Integrations",
        message: `${provider} is required by your AI employees or workflows but isn't connected.`,
        href: `/w/${slug}/integrations`,
        cta: "Connect",
      });
    }
  }
  for (const conn of connections) {
    if (conn.healthStatus !== "connected") {
      findings.push({
        severity: "error",
        area: "Integrations",
        message: `${conn.provider} connection is ${conn.healthStatus} — agents can't use it until it's re-authorized.`,
        href: `/w/${slug}/integrations`,
        cta: "Re-connect",
      });
    } else if (conn.isDemo) {
      findings.push({
        severity: "info",
        area: "Integrations",
        message: `${conn.provider} is a demo connection. Swap it for a real account before relying on results.`,
        href: `/w/${slug}/integrations`,
        cta: "Upgrade",
      });
    }
  }

  // Agents --------------------------------------------------------------------
  for (const { agent } of agentRows) {
    if (agent.status === "needs_setup") {
      findings.push({
        severity: "warn",
        area: "AI employees",
        message: `${agent.name} hasn't finished the setup interview — memory and SOPs are empty.`,
        href: `/w/${slug}/agents/${agent.id}`,
        cta: "Finish setup",
      });
    }
    if (agent.status === "blocked" || agent.status === "error") {
      findings.push({
        severity: "error",
        area: "AI employees",
        message: `${agent.name} is ${agent.status} and not doing any work.`,
        href: `/w/${slug}/agents/${agent.id}`,
        cta: "Investigate",
      });
    }
    if (agent.spendCapMonthlyCents === null) {
      findings.push({
        severity: "info",
        area: "AI employees",
        message: `${agent.name} has no monthly spend cap.`,
        href: `/w/${slug}/agents/${agent.id}`,
        cta: "Set cap",
      });
    }
  }

  // Workflows -------------------------------------------------------------------
  const failuresByWorkflow = new Map<string, number>();
  for (const run of recentRuns) {
    if (run.status === "failed" && run.workflowId) {
      failuresByWorkflow.set(
        run.workflowId,
        (failuresByWorkflow.get(run.workflowId) ?? 0) + 1,
      );
    }
  }
  for (const { workflow } of workflowRows) {
    if (workflow.status === "active" && !workflow.lastSimulatedAt) {
      findings.push({
        severity: "warn",
        area: "Workflows",
        message: `"${workflow.name}" went live without ever being simulated.`,
        href: `/w/${slug}/workflows/${workflow.id}`,
        cta: "Simulate",
      });
    }
    if (workflow.status === "draft" || workflow.status === "ready") {
      findings.push({
        severity: "info",
        area: "Workflows",
        message: `"${workflow.name}" is set up but not active yet.`,
        href: `/w/${slug}/workflows/${workflow.id}`,
        cta: "Activate",
      });
    }
    const failures = failuresByWorkflow.get(workflow.id) ?? 0;
    if (failures > 0) {
      findings.push({
        severity: "error",
        area: "Workflows",
        message: `"${workflow.name}" failed ${failures} time${failures === 1 ? "" : "s"} in the last 7 days.`,
        href: `/w/${slug}/runs`,
        cta: "See runs",
      });
    }
    const wfTriggers = triggerRows.filter((t) => t.workflowId === workflow.id);
    if (
      workflow.status === "active" &&
      wfTriggers.length > 0 &&
      wfTriggers.every((t) => !t.enabled)
    ) {
      findings.push({
        severity: "warn",
        area: "Workflows",
        message: `"${workflow.name}" is active but all its triggers are disabled — it will never fire.`,
        href: `/w/${slug}/workflows/${workflow.id}`,
        cta: "Enable trigger",
      });
    }
  }

  // Approvals ------------------------------------------------------------------
  const staleApprovals = pendingApprovals.filter(
    (a) => Date.now() - new Date(a.createdAt).getTime() > 48 * 3_600_000,
  );
  if (staleApprovals.length > 0) {
    findings.push({
      severity: "warn",
      area: "Approvals",
      message: `${staleApprovals.length} approval${staleApprovals.length === 1 ? " has" : "s have"} been waiting more than 48 hours — runs are parked until someone decides.`,
      href: `/w/${slug}/approvals`,
      cta: "Review",
    });
  }

  // Knowledge & brand ------------------------------------------------------------
  if (knowledgeCount.length === 0) {
    findings.push({
      severity: "info",
      area: "Knowledge",
      message:
        "The knowledge base is empty. Uploading SOPs and reference docs sharply improves output quality.",
      href: `/w/${slug}/knowledge`,
      cta: "Add docs",
    });
  }
  if (brandRows.length === 0) {
    findings.push({
      severity: "info",
      area: "Brand",
      message:
        "No brand profile yet — agents don't know your tone, offerings, or forbidden claims.",
      href: `/w/${slug}/brand`,
      cta: "Set up brand",
    });
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const score = Math.max(0, 100 - errors * 20 - warns * 8);
  const order: Severity[] = ["error", "warn", "info"];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Workspace health"
        subtitle="Setup diagnostics: what's connected, what's blocked, and what to fix next."
      />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <p
            className={`text-3xl font-semibold ${score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600"}`}
          >
            {score}
          </p>
          <p className="text-sm text-slate-500">health score</p>
        </Card>
        <Card>
          <p className="text-3xl font-semibold text-slate-900">{errors}</p>
          <p className="text-sm text-slate-500">blocking issues</p>
        </Card>
        <Card>
          <p className="text-3xl font-semibold text-slate-900">{warns}</p>
          <p className="text-sm text-slate-500">warnings</p>
        </Card>
      </div>

      {findings.length === 0 ? (
        <EmptyState
          title="All clear"
          hint="Everything is connected, simulated, and moving. Nice."
        />
      ) : (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <Card key={i} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[f.severity].badge}`}
                  >
                    {f.area}
                  </span>
                  <p className="text-sm text-slate-700">{f.message}</p>
                </div>
                <Link
                  href={f.href}
                  className="shrink-0 text-sm font-medium text-brand-600 hover:underline"
                >
                  {SEVERITY_STYLE[f.severity].label}: {f.cta} →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
