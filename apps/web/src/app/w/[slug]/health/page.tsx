import Link from "next/link";
import { and, eq, lt } from "drizzle-orm";
import {
  agents,
  approvalRequests,
  brandProfiles,
  integrationConnections,
  knowledgeItems,
  workflows,
} from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, PageHeader } from "@/components/ui";

interface Check {
  ok: boolean;
  level: "good" | "warn" | "action";
  title: string;
  detail: string;
  href?: string;
}

// Concierge tooling (Plan 3.5): setup diagnostics + workspace health report —
// "Gmail connected, calendar permission missing, CRM field mapping needs
// review" style, generated from live workspace state.
export default async function HealthPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const wsId = ctx.workspace.id;

  const dayAgo = new Date(Date.now() - 86_400_000);
  const [conns, agentRows, workflowRows, agingApprovals, brand, knowledge] =
    await Promise.all([
      ctx.db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.workspaceId, wsId)),
      ctx.db.select().from(agents).where(eq(agents.workspaceId, wsId)),
      ctx.db.select().from(workflows).where(eq(workflows.workspaceId, wsId)),
      ctx.db
        .select()
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.workspaceId, wsId),
            eq(approvalRequests.status, "pending"),
            lt(approvalRequests.createdAt, dayAgo),
          ),
        ),
      ctx.db.select().from(brandProfiles).where(eq(brandProfiles.workspaceId, wsId)),
      ctx.db
        .select({ id: knowledgeItems.id })
        .from(knowledgeItems)
        .where(eq(knowledgeItems.workspaceId, wsId))
        .limit(1),
    ]);

  const checks: Check[] = [];

  // Integrations
  if (conns.length === 0) {
    checks.push({
      ok: false,
      level: "action",
      title: "No integrations connected",
      detail: "Agents can't reach your tools. Connect Google Workspace to start.",
      href: `/w/${slug}/integrations`,
    });
  } else {
    for (const c of conns) {
      checks.push(
        c.healthStatus === "connected"
          ? {
              ok: true,
              level: "good",
              title: `${c.provider} connected`,
              detail: `${c.accountLabel}${c.isDemo ? " (demo account — swap for OAuth before go-live)" : ""}`,
            }
          : {
              ok: false,
              level: "action",
              title: `${c.provider} needs attention`,
              detail: `Status: ${c.healthStatus.replaceAll("_", " ")} — reconnect it.`,
              href: `/w/${slug}/integrations`,
            },
      );
    }
  }

  // Agents
  const needsSetup = agentRows.filter((a) => a.status === "needs_setup");
  const paused = agentRows.filter((a) => a.status === "paused");
  const noCap = agentRows.filter((a) => a.spendCapMonthlyCents === null);
  if (agentRows.length === 0) {
    checks.push({
      ok: false,
      level: "action",
      title: "No AI employees hired",
      detail: "Install the Agency Ops pack or hire from a template.",
      href: `/w/${slug}/onboarding`,
    });
  }
  for (const a of needsSetup) {
    checks.push({
      ok: false,
      level: "warn",
      title: `${a.name} hasn't finished the setup interview`,
      detail: "Answers become memory that sharpens every run.",
      href: `/w/${slug}/agents/${a.id}`,
    });
  }
  for (const a of paused) {
    checks.push({
      ok: false,
      level: "warn",
      title: `${a.name} is paused`,
      detail: "Paused agents skip their scheduled workflows.",
      href: `/w/${slug}/agents/${a.id}`,
    });
  }
  if (noCap.length > 0 && agentRows.length > 0) {
    checks.push({
      ok: false,
      level: "warn",
      title: `${noCap.length} agent${noCap.length === 1 ? " has" : "s have"} no spend cap`,
      detail: "Set a monthly cap so runaway costs hard-stop automatically.",
      href: `/w/${slug}/agents`,
    });
  }

  // Workflows
  const neverSimulated = workflowRows.filter((w) => !w.lastSimulatedAt && w.status !== "active");
  const drafts = workflowRows.filter((w) => w.status === "draft" || w.status === "ready");
  for (const w of neverSimulated.slice(0, 5)) {
    checks.push({
      ok: false,
      level: "warn",
      title: `"${w.name}" has never been simulated`,
      detail: "Simulate before activating to preview exactly what it will do.",
      href: `/w/${slug}/workflows/${w.id}`,
    });
  }
  if (drafts.length > 0) {
    checks.push({
      ok: false,
      level: "warn",
      title: `${drafts.length} workflow${drafts.length === 1 ? " isn't" : "s aren't"} active yet`,
      detail: "Draft/ready workflows don't fire on their schedules until activated.",
      href: `/w/${slug}/workflows`,
    });
  }

  // Approvals
  if (agingApprovals.length > 0) {
    checks.push({
      ok: false,
      level: "action",
      title: `${agingApprovals.length} approval${agingApprovals.length === 1 ? "" : "s"} waiting more than 24h`,
      detail: "Approval latency is the #1 driver of workflow completion.",
      href: `/w/${slug}/approvals`,
    });
  }

  // Grounding
  if (!brand[0] || !brand[0].tone) {
    checks.push({
      ok: false,
      level: "warn",
      title: "Brand profile is empty",
      detail: "Tone, offerings, and forbidden claims make every draft sound like you.",
      href: `/w/${slug}/brand`,
    });
  }
  if (knowledge.length === 0) {
    checks.push({
      ok: false,
      level: "warn",
      title: "No knowledge added",
      detail: "SOPs and company docs get cited in agent outputs.",
      href: `/w/${slug}/knowledge`,
    });
  }

  const actions = checks.filter((c) => c.level === "action");
  const warns = checks.filter((c) => c.level === "warn");
  const good = checks.filter((c) => c.level === "good");
  const score = Math.max(
    0,
    Math.round(100 - actions.length * 25 - warns.length * 8),
  );

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Workspace health"
        subtitle="Setup diagnostics — what's working and what needs attention before your AI team runs at full speed."
      />
      <Card className="mb-6 flex items-center gap-5">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold ${
            score >= 80
              ? "bg-emerald-100 text-emerald-700"
              : score >= 50
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          {score}
        </div>
        <div>
          <p className="font-medium text-slate-900">
            {score >= 80 ? "Looking healthy" : score >= 50 ? "A few things need attention" : "Setup needs work"}
          </p>
          <p className="text-sm text-slate-500">
            {actions.length} action item{actions.length === 1 ? "" : "s"} · {warns.length}{" "}
            suggestion{warns.length === 1 ? "" : "s"} · {good.length} healthy
          </p>
        </div>
      </Card>

      <div className="space-y-2">
        {[...actions, ...warns, ...good].map((c, i) => (
          <Card key={i} className="!p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  <span className="mr-2">
                    {c.level === "good" ? "✅" : c.level === "warn" ? "💡" : "⚠️"}
                  </span>
                  {c.title}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{c.detail}</p>
              </div>
              {c.href && (
                <Link
                  href={c.href}
                  className="shrink-0 text-sm font-medium text-brand-600 hover:underline"
                >
                  Fix →
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
