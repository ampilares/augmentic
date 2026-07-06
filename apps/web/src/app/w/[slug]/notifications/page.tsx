import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notifications } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { markAllNotificationsReadAction } from "@/lib/actions/notification-actions";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

const KIND_ICONS: Record<string, string> = {
  approval_pending: "✋",
  run_failed: "✕",
  run_blocked: "⛔",
  budget_hard_stop: "◔",
  weekly_summary: "▤",
};

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const rows = await ctx.db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, ctx.workspace.id),
        eq(notifications.userId, ctx.user.id),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="Approvals waiting on you, blocked runs, and failures."
        action={
          rows.some((r) => !r.readAt) ? (
            <form action={markAllNotificationsReadAction.bind(null, slug)}>
              <Button variant="secondary" type="submit">Mark all read</Button>
            </form>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          hint="You'll hear about pending approvals, blocked runs, and failures here."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => (
            <Card
              key={n.id}
              className={`!p-4 ${n.readAt ? "opacity-60" : "border-l-4 border-l-brand-500"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    <span className="mr-2">{KIND_ICONS[n.kind] ?? "•"}</span>
                    {n.title}
                  </p>
                  {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                  {n.href && (
                    <Link
                      href={`/w/${slug}${n.href}`}
                      className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
                    >
                      Open →
                    </Link>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
