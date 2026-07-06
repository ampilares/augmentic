import Link from "next/link";
import { eq } from "drizzle-orm";
import { memberships, workspaces } from "@augmentic/db";
import { getBootedDb } from "@/lib/boot";
import { requireUser } from "@/lib/context";
import { createWorkspaceAction } from "@/lib/actions/workspace-actions";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";

export default async function WorkspacesPage() {
  const user = await requireUser();
  const db = await getBootedDb();
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, user.id));

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle="Pick a workspace or create one for your business."
      />
      <div className="space-y-3">
        {rows.map((ws) => (
          <Link key={ws.id} href={`/w/${ws.slug}`} className="block">
            <Card className="flex items-center justify-between transition-colors hover:border-brand-500">
              <div>
                <p className="font-medium text-slate-900">{ws.name}</p>
                <p className="text-sm text-slate-500">Your role: {ws.role}</p>
              </div>
              <span className="text-brand-600">→</span>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-8">
        <h2 className="mb-3 font-medium text-slate-900">Create a workspace</h2>
        <form action={createWorkspaceAction} className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Business name</Label>
            <Input name="name" required minLength={2} placeholder="Beacon Studio" />
          </div>
          <Button type="submit">Create</Button>
        </form>
      </Card>
    </main>
  );
}
