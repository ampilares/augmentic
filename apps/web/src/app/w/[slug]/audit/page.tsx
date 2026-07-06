import { and, desc, eq } from "drizzle-orm";
import { auditEvents } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string; actor?: string }>;
}) {
  const { slug } = await params;
  const { type, actor } = await searchParams;
  const ctx = await requireWorkspace(slug);

  const conditions = [eq(auditEvents.workspaceId, ctx.workspace.id)];
  if (type) conditions.push(eq(auditEvents.eventType, type));
  if (actor) conditions.push(eq(auditEvents.actorLabel, actor));

  const rows = await ctx.db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);

  const eventTypes = [...new Set(rows.map((r) => r.eventType))];

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Append-only record of every mutation, approval, and external write."
      />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <a
          href={`/w/${slug}/audit`}
          className={`rounded-full px-2.5 py-1 ${!type ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}
        >
          all
        </a>
        {eventTypes.map((t) => (
          <a
            key={t}
            href={`/w/${slug}/audit?type=${encodeURIComponent(t)}`}
            className={`rounded-full px-2.5 py-1 ${type === t ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}
          >
            {t}
          </a>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No audit events match" />
      ) : (
        <Card className="!p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Event</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs text-slate-400">{e.actorType}</span>{" "}
                    <span className="text-slate-700">{e.actorLabel}</span>
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-800">{e.eventType}</td>
                  <td className="max-w-md truncate px-4 py-2 text-xs text-slate-500">
                    {JSON.stringify(e.payload)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
