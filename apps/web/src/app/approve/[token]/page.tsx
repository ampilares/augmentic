import { eq } from "drizzle-orm";
import { agents, approvalLinks, approvalRequests, workspaces } from "@augmentic/db";
import { getBootedDb } from "@/lib/boot";
import {
  decideExternalApprovalAction,
  loadValidLink,
} from "@/lib/actions/external-approval-actions";
import { Button, Input, RiskBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

// Client-safe approval view (FR-024): approval-only, no workspace access.
// Everything on this page is scoped to exactly one approval request; the
// token is the credential and is re-validated on the decision action.
export default async function ExternalApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await loadValidLink(token);

  if (!valid.ok) {
    const messages: Record<string, { title: string; body: string }> = {
      not_found: {
        title: "Link not found",
        body: "This approval link doesn't exist. Check the URL or ask for a new link.",
      },
      expired: {
        title: "Link expired",
        body: "This approval link has expired. Ask your contact to send a fresh one.",
      },
      revoked: {
        title: "Link revoked",
        body: "This approval link was revoked. Ask your contact if a decision is still needed.",
      },
      decided: {
        title: "Already decided",
        body: "This request has already been decided — nothing further is needed. Thank you!",
      },
    };
    const m = messages[valid.reason]!;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{m.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{m.body}</p>
        </div>
      </main>
    );
  }

  const db = await getBootedDb();
  const [row] = await db
    .select({
      approval: approvalRequests,
      agentName: agents.name,
      workspaceName: workspaces.name,
      expiresAt: approvalLinks.expiresAt,
    })
    .from(approvalLinks)
    .innerJoin(approvalRequests, eq(approvalLinks.approvalRequestId, approvalRequests.id))
    .innerJoin(agents, eq(approvalRequests.agentId, agents.id))
    .innerJoin(workspaces, eq(approvalRequests.workspaceId, workspaces.id))
    .where(eq(approvalLinks.id, valid.ctx.linkId));
  const a = row!.approval;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold text-brand-700">Augmentic</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {row!.workspaceName} asks for your approval
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review the draft below and approve or decline. Link expires{" "}
            {new Date(row!.expiresAt).toLocaleDateString()}.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate-700">
              <span className="font-medium">{row!.agentName}</span> (AI assistant) prepared:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {a.requestedAction}
              </code>
            </p>
            <RiskBadge tier={a.riskTier} />
          </div>

          <p className="mt-3 text-xs font-medium uppercase text-slate-400">Task</p>
          <p className="mt-1 text-sm text-slate-600">{a.originalInstruction}</p>

          <p className="mt-4 text-xs font-medium uppercase text-slate-400">
            Exact content to be sent
          </p>
          {/* Watermarked preview: this is a review copy, not the live artifact. */}
          <div className="relative mt-1 overflow-hidden rounded border border-slate-200">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <p className="-rotate-12 select-none text-4xl font-black tracking-widest text-slate-200/70">
                PREVIEW
              </p>
            </div>
            <pre className="relative max-h-72 overflow-auto bg-slate-50/80 p-3 text-xs text-slate-700">
              {JSON.stringify(a.editedPayload ?? a.payload, null, 2)}
            </pre>
          </div>

          <form
            action={decideExternalApprovalAction.bind(null, token)}
            className="mt-5 space-y-3 border-t border-slate-100 pt-4"
          >
            <Input name="comment" placeholder="Optional note for the team" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                name="action"
                value="approve"
                type="submit"
                className="w-full justify-center py-3 sm:w-auto"
              >
                Approve
              </Button>
              <Button
                name="action"
                value="reject"
                type="submit"
                variant="danger"
                className="w-full justify-center py-3 sm:w-auto"
              >
                Decline
              </Button>
            </div>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Shared with {valid.ctx.recipientLabel} · Your decision is recorded in the audit log.
        </p>
      </div>
    </main>
  );
}
