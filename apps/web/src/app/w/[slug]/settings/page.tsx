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
  const settings = (ws?.settings ?? {}) as {
    notificationsSlackChannel?: string;
    retentionDays?: number;
    allowedInviteDomains?: string[];
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Workspace settings" subtitle={ctx.workspace.name} />
      <Card>
        <form action={saveWorkspaceSettingsAction.bind(null, slug)} className="space-y-5">
          <div>
            <h3 className="mb-2 font-medium text-slate-900">Notifications</h3>
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
          <div>
            <h3 className="mb-2 font-medium text-slate-900">Security</h3>
            <Label>Allowed invite domains (comma-separated, optional)</Label>
            <p className="mb-1 text-xs text-slate-400">
              When set, teammates can only be invited from these email domains.
            </p>
            <Input
              name="allowedInviteDomains"
              placeholder="yourcompany.com, agencypartner.co"
              defaultValue={(settings.allowedInviteDomains ?? []).join(", ")}
              disabled={!canEdit}
            />
          </div>
          <div>
            <h3 className="mb-2 font-medium text-slate-900">Data retention</h3>
            <Label>Purge run data older than (days, optional; min 7)</Label>
            <p className="mb-1 text-xs text-slate-400">
              Deletes old run steps, tool calls, artifacts, and notifications. The audit log
              is append-only and always kept — export it below.
            </p>
            <Input
              name="retentionDays"
              type="number"
              min={7}
              placeholder="90"
              defaultValue={settings.retentionDays ?? ""}
              disabled={!canEdit}
            />
          </div>
          {canEdit && <Button type="submit">Save settings</Button>}
        </form>
      </Card>

      {canEdit && (
        <Card>
          <h3 className="mb-2 font-medium text-slate-900">Audit export</h3>
          <p className="mb-3 text-sm text-slate-500">
            Download the complete append-only audit log for compliance or review.
          </p>
          <div className="flex gap-3">
            <a
              href={`/api/workspaces/${slug}/audit/export?format=csv`}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </a>
            <a
              href={`/api/workspaces/${slug}/audit/export?format=json`}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export JSON
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
