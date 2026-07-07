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
    auditRetentionDays?: number;
    strictApprovals?: boolean;
    allowedEmailDomains?: string[];
    sessionMaxHours?: number;
  };

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

      <Card className="mt-6">
        <h3 className="mb-1 font-medium text-slate-900">Data retention</h3>
        <p className="mb-3 text-xs text-slate-400">
          Finished runs (with their steps, tool calls, and artifacts) and notifications older
          than the window are deleted daily. Runs waiting on approval are never deleted.
          Leave blank to keep everything.
        </p>
        <form
          action={saveWorkspaceSettingsAction.bind(null, slug)}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <Label>Run &amp; notification retention (days)</Label>
            <Input
              name="retentionDays"
              type="number"
              min="1"
              placeholder="keep forever"
              defaultValue={settings.retentionDays ?? ""}
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Audit log retention (days)</Label>
            <Input
              name="auditRetentionDays"
              type="number"
              min="1"
              placeholder="keep forever"
              defaultValue={settings.auditRetentionDays ?? ""}
              disabled={!canEdit}
            />
          </div>
          {canEdit && <Button type="submit">Save</Button>}
        </form>
      </Card>

      <Card className="mt-6">
        <h3 className="mb-1 font-medium text-slate-900">Security</h3>
        <p className="mb-3 text-xs text-slate-400">
          Workspace-level guardrails. Per-agent settings can tighten these, never loosen them.
        </p>
        <form
          action={saveWorkspaceSettingsAction.bind(null, slug)}
          className="space-y-4"
        >
          <input type="hidden" name="securityForm" value="1" />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="strictApprovals"
              defaultChecked={Boolean(settings.strictApprovals)}
              disabled={!canEdit}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <span>
              <span className="font-medium">Strict approvals</span> — every action above a
              draft (internal writes, external sends, publishing) requires human approval,
              regardless of per-agent autonomy settings.
            </span>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <Label>Allowed invite domains (optional)</Label>
              <p className="mb-1 text-xs text-slate-400">
                Comma-separated. When set, team invites outside these domains are rejected.
              </p>
              <Input
                name="allowedEmailDomains"
                placeholder="yourcompany.com, agency.co"
                defaultValue={(settings.allowedEmailDomains ?? []).join(", ")}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Max session age (hours)</Label>
              <p className="mb-1 text-xs text-slate-400">
                Older sign-ins must re-authenticate to access this workspace.
              </p>
              <Input
                name="sessionMaxHours"
                type="number"
                min="1"
                placeholder="no limit"
                defaultValue={settings.sessionMaxHours ?? ""}
                disabled={!canEdit}
              />
            </div>
          </div>
          {canEdit && <Button type="submit">Save security settings</Button>}
        </form>
      </Card>
    </div>
  );
}
