import Link from "next/link";
import { eq } from "drizzle-orm";
import { agents } from "@augmentic/db";
import { requireWorkspace } from "@/lib/context";
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const rows = await ctx.db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, ctx.workspace.id));

  return (
    <div>
      <PageHeader
        title="AI Employees"
        subtitle="Your roster of hired AI employees."
        action={<LinkButton href={`/w/${slug}/agents/hire`}>+ Hire AI employee</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No AI employees yet"
          hint="Pick a role template and have your first AI employee ready in a minute."
          action={<LinkButton href={`/w/${slug}/agents/hire`}>Hire AI employee</LinkButton>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {rows.map((a) => (
            <Link key={a.id} href={`/w/${slug}/agents/${a.id}`}>
              <Card className="h-full transition-colors hover:border-brand-500">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{a.name}</p>
                    <p className="text-sm text-slate-500">{a.roleTitle}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-500">
                  {a.jobDescription}
                </p>
                <p className="mt-3 text-xs text-slate-400">
                  autonomy: {a.autonomyMode.replaceAll("_", " ")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
