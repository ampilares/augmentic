import { desc, eq, isNull, and } from "drizzle-orm";
import { invitations, memberships, users } from "@augmentic/db";
import { WORKSPACE_ROLES } from "@augmentic/shared";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import { inviteMemberAction } from "@/lib/actions/workspace-actions";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const canManage = roleAtLeast(ctx.role, "admin");

  const members = await ctx.db
    .select({ m: memberships, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.workspaceId, ctx.workspace.id));

  const pendingInvites = await ctx.db
    .select()
    .from(invitations)
    .where(and(eq(invitations.workspaceId, ctx.workspace.id), isNull(invitations.acceptedAt)))
    .orderBy(desc(invitations.createdAt));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Team"
        subtitle="Owner, admin, operator, approver, and viewer roles control what each person can do."
      />
      <Card className="mb-6">
        <h3 className="mb-3 font-medium text-slate-900">Members</h3>
        <ul className="divide-y divide-slate-100">
          {members.map(({ m, name, email }) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-800">{name}</p>
                <p className="text-xs text-slate-400">{email}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {canManage && (
        <Card>
          <h3 className="mb-3 font-medium text-slate-900">Invite someone</h3>
          <form
            action={inviteMemberAction.bind(null, slug)}
            className="flex items-end gap-3"
          >
            <div className="flex-1">
              <Label>Email</Label>
              <Input name="email" type="email" required />
            </div>
            <div className="w-40">
              <Label>Role</Label>
              <Select name="role" defaultValue="operator">
                {WORKSPACE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Invite</Button>
          </form>
          {pendingInvites.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase text-slate-400">Pending invites</p>
              <ul className="space-y-1 text-sm text-slate-600">
                {pendingInvites.map((i) => (
                  <li key={i.id}>
                    {i.email} as {i.role} — they get access when they sign up with this email
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
