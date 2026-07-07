import { eq } from "drizzle-orm";
import { agents, approvalLinks, approvalRequests } from "@augmentic/db";
import { decideApproval, recordAudit } from "@augmentic/engine";
import { redirect } from "next/navigation";
import { getBootedDb } from "@/lib/boot";
import { RiskBadge, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

// Client-safe external approval page (FR-024): token-scoped, expiring, shows
// only this one request — no workspace navigation, watermarked preview.
// Approve/reject only; edits and revisions stay internal.
export default async function ExternalApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = await getBootedDb();

  const [link] = await db
    .select()
    .from(approvalLinks)
    .where(eq(approvalLinks.token, token));

  if (!link || link.expiresAt < new Date()) {
    return (
      <Shell>
        <p className="text-center text-slate-600">
          This approval link is invalid or has expired. Ask the sender for a new one.
        </p>
      </Shell>
    );
  }

  const [approval] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, link.approvalRequestId));
  if (!approval) {
    return (
      <Shell>
        <p className="text-center text-slate-600">This approval no longer exists.</p>
      </Shell>
    );
  }
  const [agent] = await db.select().from(agents).where(eq(agents.id, approval.agentId));

  async function decide(formData: FormData) {
    "use server";
    const db2 = await getBootedDb();
    const [freshLink] = await db2
      .select()
      .from(approvalLinks)
      .where(eq(approvalLinks.token, token));
    if (!freshLink || freshLink.expiresAt < new Date()) {
      throw new Error("Link expired");
    }
    const action = String(formData.get("action"));
    if (action !== "approve" && action !== "reject") throw new Error("Invalid action");
    const comment = String(formData.get("comment") ?? "").slice(0, 2000) || undefined;
    await decideApproval(db2, {
      workspaceId: freshLink.workspaceId,
      approvalRequestId: freshLink.approvalRequestId,
      action,
      decidedByUserId: null,
      decidedByLabel: `external-link:${freshLink.label ?? freshLink.token.slice(0, 8)}`,
      comment,
    });
    await db2
      .update(approvalLinks)
      .set({ usedAt: new Date() })
      .where(eq(approvalLinks.id, freshLink.id));
    await recordAudit(db2, {
      workspaceId: freshLink.workspaceId,
      actorType: "system",
      actorLabel: `approval-link:${freshLink.token.slice(0, 8)}`,
      eventType: "approval.external_decision",
      entityType: "approval_request",
      entityId: freshLink.approvalRequestId,
      payload: { action, label: freshLink.label },
    });
    redirect(`/approve/${token}?done=1`);
  }

  const payload = (approval.editedPayload ?? approval.payload) as Record<string, unknown>;

  return (
    <Shell>
      <div className="mb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Approval requested{link.label ? ` · for ${link.label}` : ""}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          {agent?.name ?? "An AI employee"} wants to run{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-base">
            {approval.requestedAction}
          </code>
        </h1>
        <div className="mt-2 flex items-center justify-center gap-2">
          <RiskBadge tier={approval.riskTier} />
          <StatusBadge status={approval.status} />
        </div>
      </div>

      <div className="relative rounded-xl border border-slate-200 bg-white p-5">
        {/* Watermark */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <p className="rotate-[-20deg] text-4xl font-bold tracking-widest text-slate-100 select-none">
            REVIEW COPY
          </p>
        </div>
        <div className="relative space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase text-slate-400">Instruction</p>
            <p className="mt-1 text-slate-700">{approval.originalInstruction}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-slate-400">Proposed content</p>
            <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-slate-400">
              Why approval is needed
            </p>
            <p className="mt-1 text-slate-600">{approval.policyReason}</p>
          </div>
        </div>
      </div>

      {approval.status === "pending" ? (
        <form action={decide} className="mt-5 space-y-3">
          <input
            name="comment"
            placeholder="Optional comment"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          <div className="flex gap-3">
            <button
              name="action"
              value="approve"
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700"
            >
              Approve
            </button>
            <button
              name="action"
              value="reject"
              className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-base font-semibold text-white hover:bg-red-700"
            >
              Reject
            </button>
          </div>
          <p className="text-center text-xs text-slate-400">
            Your decision is recorded and the requester is notified. This link expires{" "}
            {link.expiresAt.toLocaleDateString()}.
          </p>
        </form>
      ) : (
        <p className="mt-5 text-center text-sm font-medium text-slate-600">
          This request has been decided ({approval.status.replaceAll("_", " ")}). Thank you!
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <p className="mb-6 text-center text-lg font-bold text-brand-700">Augmentic</p>
      {children}
    </main>
  );
}
