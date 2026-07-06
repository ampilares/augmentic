import {
  integrationConnections,
  memberships,
  notifications,
  workspaces,
  type Db,
} from "@augmentic/db";
import { executeTool } from "@augmentic/connectors";
import { and, eq, inArray } from "drizzle-orm";

export interface NotifyInput {
  workspaceId: string;
  kind:
    | "approval_pending"
    | "run_failed"
    | "run_blocked"
    | "budget_hard_stop"
    | "weekly_summary";
  title: string;
  body?: string;
  href?: string;
}

// Fan out a workspace event: in-app rows for members who can act on it, plus
// a Slack post when the workspace has a notifications channel configured
// (workspace.settings.notificationsSlackChannel) and a Slack connection.
export async function notifyWorkspace(db: Db, input: NotifyInput): Promise<void> {
  const actorRoles =
    input.kind === "approval_pending"
      ? ["owner", "admin", "approver"]
      : ["owner", "admin", "operator"];
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, input.workspaceId),
        inArray(memberships.role, actorRoles as never),
      ),
    );
  if (members.length > 0) {
    await db.insert(notifications).values(
      members.map((m) => ({
        workspaceId: input.workspaceId,
        userId: m.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
      })),
    );
  }

  try {
    const [ws] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, input.workspaceId));
    const channel = (ws?.settings as { notificationsSlackChannel?: string })
      ?.notificationsSlackChannel;
    if (!channel) return;
    const [conn] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.workspaceId, input.workspaceId),
          eq(integrationConnections.provider, "slack"),
        ),
      );
    if (!conn) return;
    await executeTool(
      "slack.post_message",
      { channel, text: `*${input.title}*${input.body ? `\n${input.body}` : ""}` },
      {
        workspaceId: input.workspaceId,
        connection: {
          id: conn.id,
          provider: conn.provider,
          isDemo: conn.isDemo,
          accountLabel: conn.accountLabel,
        },
        mode: "live",
      },
    );
  } catch {
    // Slack delivery is best-effort; in-app rows are the source of truth.
  }
}
