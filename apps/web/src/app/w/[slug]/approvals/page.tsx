import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  agents,
  approvalLinks,
  approvalRequests,
  integrationConnections,
} from "@augmentic/db";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import {
  createApprovalLinkAction,
  decideApprovalAction,
} from "@/lib/actions/approval-actions";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  RiskBadge,
  StatusBadge,
  Textarea,
} from "@/components/ui";

// Approval Center (Journey D / Spec §7.3): every request shows the requester,
// original instruction, exact payload, tool + account, data leaving the
// workspace, risk + policy reason, and evidence. Approve / reject / edit /
// request revision / comment.
export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const showHistory = tab === "history";
  const ctx = await requireWorkspace(slug);
  const canApprove = roleAtLeast(ctx.role, "approver");

  const rows = await ctx.db
    .select({ approval: approvalRequests, agentName: agents.name })
    .from(approvalRequests)
    .innerJoin(agents, eq(approvalRequests.agentId, agents.id))
    .where(eq(approvalRequests.workspaceId, ctx.workspace.id))
    .orderBy(desc(approvalRequests.createdAt));

  const connections = await ctx.db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.workspaceId, ctx.workspace.id));

  const links = await ctx.db
    .select()
    .from(approvalLinks)
    .where(eq(approvalLinks.workspaceId, ctx.workspace.id));
  const baseUrl = process.env.AUGMENTIC_BASE_URL ?? "http://localhost:3000";

  const pending = rows.filter((r) => r.approval.status === "pending");
  const history = rows.filter((r) => r.approval.status !== "pending");
  const shown = showHistory ? history : pending;

  return (
    <div>
      <PageHeader
        title="Approval Center"
        subtitle="Sensitive actions wait here. The run resumes exactly where it paused — minutes or days later."
      />
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        <Link
          href={`/w/${slug}/approvals`}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${!showHistory ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}
        >
          Pending ({pending.length})
        </Link>
        <Link
          href={`/w/${slug}/approvals?tab=history`}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${showHistory ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}
        >
          History ({history.length})
        </Link>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={showHistory ? "No decided approvals yet" : "Nothing waiting for approval"}
          hint={
            showHistory
              ? "Decisions will appear here with the approver and outcome."
              : "When an agent proposes a sensitive action — like sending an external email — it appears here."
          }
        />
      ) : (
        <div className="space-y-4">
          {shown.map(({ approval: a, agentName }) => {
            const connLabel =
              connections.find((c) =>
                a.requestedAction.startsWith(c.provider === "google" ? "g" : c.provider),
              )?.accountLabel ?? "workspace connection";
            const evidence = (a.evidence ?? []) as {
              source: string;
              title: string;
              excerpt: string;
            }[];
            return (
              <Card key={a.id} className="border-l-4 border-l-amber-400">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">
                      {agentName} wants to run{" "}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
                        {a.requestedAction}
                      </code>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(a.createdAt).toLocaleString()} · via {connLabel} ·{" "}
                      <Link
                        href={`/w/${slug}/runs/${a.workflowRunId}`}
                        className="text-brand-600 hover:underline"
                      >
                        view run
                      </Link>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge tier={a.riskTier} />
                    <StatusBadge status={a.status} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-400">
                      Original instruction
                    </p>
                    <p className="mt-1 text-slate-600">{a.originalInstruction}</p>
                    <p className="mt-3 text-xs font-medium uppercase text-slate-400">
                      Why approval is required
                    </p>
                    <p className="mt-1 text-slate-600">{a.policyReason}</p>
                    {a.agentRationale && (
                      <>
                        <p className="mt-3 text-xs font-medium uppercase text-slate-400">
                          Agent rationale
                        </p>
                        <p className="mt-1 text-slate-600">{a.agentRationale}</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-400">
                      Exact payload (data leaving your workspace)
                    </p>
                    <pre className="mt-1 max-h-44 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                      {JSON.stringify(a.editedPayload ?? a.payload, null, 2)}
                    </pre>
                    {evidence.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                          evidence used ({evidence.length})
                        </summary>
                        <ul className="mt-1 space-y-1 text-xs text-slate-500">
                          {evidence.map((e, i) => (
                            <li key={i} className="rounded bg-slate-50 p-2">
                              <span className="font-medium">{e.source}</span>: {e.excerpt}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>

                {a.status === "pending" && canApprove && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <form
                        action={decideApprovalAction.bind(null, slug, a.id)}
                        className="space-y-2"
                      >
                        <Textarea
                          name="editedPayload"
                          rows={3}
                          placeholder={`Optional: edit the payload JSON before approving\n${JSON.stringify(a.payload)}`}
                          className="font-mono !text-xs"
                        />
                        <Input name="comment" placeholder="Optional comment" />
                        <div className="flex gap-2">
                          <Button name="action" value="approve" type="submit">
                            Approve
                          </Button>
                          <Button
                            name="action"
                            value="edit"
                            type="submit"
                            variant="secondary"
                            title="Approve with the edited payload above"
                          >
                            Approve edited
                          </Button>
                        </div>
                      </form>
                      <form
                        action={decideApprovalAction.bind(null, slug, a.id)}
                        className="space-y-2"
                      >
                        <Input
                          name="comment"
                          placeholder="Reason / feedback for the agent"
                        />
                        <div className="flex gap-2">
                          <Button name="action" value="reject" type="submit" variant="danger">
                            Reject
                          </Button>
                          <Button
                            name="action"
                            value="request_revision"
                            type="submit"
                            variant="secondary"
                            title="Agent revises its proposal within the same run"
                          >
                            Request revision
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
                {a.status === "pending" && canApprove && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {links
                      .filter((l) => l.approvalRequestId === a.id && l.expiresAt > new Date())
                      .map((l) => (
                        <p key={l.id} className="mb-1 break-all text-xs text-slate-500">
                          🔗 Client link{l.label ? ` (${l.label})` : ""}:{" "}
                          <code className="rounded bg-slate-50 px-1">
                            {baseUrl}/approve/{l.token}
                          </code>{" "}
                          · expires {new Date(l.expiresAt).toLocaleDateString()}
                        </p>
                      ))}
                    <form
                      action={createApprovalLinkAction.bind(null, slug, a.id)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Input
                        name="label"
                        placeholder="Client name (optional)"
                        className="!w-52"
                      />
                      <Button variant="secondary" type="submit">
                        Share for external approval
                      </Button>
                      <span className="text-xs text-slate-400">
                        Approval-only page, no workspace access, expires in 7 days.
                      </span>
                    </form>
                  </div>
                )}
                {a.status !== "pending" && (
                  <p className="mt-3 text-xs text-slate-400">
                    Decided {a.decidedAt ? new Date(a.decidedAt).toLocaleString() : ""}
                    {a.decisionNote && ` — "${a.decisionNote}"`}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
