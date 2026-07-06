import { eq } from "drizzle-orm";
import { workspaces } from "@augmentic/db";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import { saveWorkspaceSettingsAction } from "@/lib/actions/notification-actions";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const canEdit = roleAtLeast(ctx.role, "admin");
  const [ws] = await ctx.db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id));
  const settings = (ws?.settings ?? {}) as { notificationsSlackChannel?: string };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Workspace settings" subtitle={ctx.workspace.name} />
      <Card>
        <h3 className="mb-3 font-medium text-slate-900">Notifications</h3>
        <form
          action={saveWorkspaceSettingsAction.bind(null, slug)}
          className="flex items-end gap-3"
        >
          <div className="flex-1">
            <Label>Slack channel for alerts (optional)</Label>
            <p className="mb-1 text-xs text-slate-400">
              Pending approvals, blocked runs, and failures also post here when Slack is
              connected.
            </p>
            <Input
              name="notificationsSlackChannel"
              placeholder="#augmentic-alerts"
              defaultValue={settings.notificationsSlackChannel ?? ""}
              disabled={!canEdit}
            />
          </div>
          {canEdit && <Button type="submit">Save</Button>}
        </form>
      </Card>
    </div>
  );
}
