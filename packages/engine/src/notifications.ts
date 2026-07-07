import {
  integrationConnections,
  memberships,
  notificationSubscriptions,
  notifications,
  users,
  workspaces,
  type Db,
} from "@augmentic/db";
import { executeTool } from "@augmentic/connectors";
import type { NotificationKind } from "@augmentic/shared";
import { and, eq, inArray } from "drizzle-orm";
import { appUrl, isEmailConfigured, sendEmail } from "./email";

export interface NotifyInput {
  workspaceId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
}

// Fan out a workspace event: in-app rows for members who can act on it, an
// email to each member who hasn't opted out (when EMAIL_FROM/RESEND_API_KEY
// are configured), plus a Slack post when the workspace has a notifications
// channel configured (workspace.settings.notificationsSlackChannel).
export async function notifyWorkspace(db: Db, input: NotifyInput): Promise<void> {
  const actorRoles =
    input.kind === "approval_pending"
      ? ["owner", "admin", "approver"]
      : ["owner", "admin", "operator"];
  const members = await db
    .select({ userId: memberships.userId, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
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

  const [ws] = await db
    .select({ slug: workspaces.slug, settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId));

  if (isEmailConfigured() && members.length > 0 && ws) {
    const subs = await db
      .select()
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.workspaceId, input.workspaceId),
          eq(notificationSubscriptions.channel, "email"),
          inArray(
            notificationSubscriptions.userId,
            members.map((m) => m.userId),
          ),
        ),
      );
    const href = input.href ? appUrl(`/w/${ws.slug}${input.href}`) : undefined;
    await Promise.all(
      members.map(async (m) => {
        // No subscription row = default opt-in to every kind; a row is an
        // explicit preference listing the kinds the user still wants.
        const sub = subs.find((s) => s.userId === m.userId);
        const wants = !sub || (sub.eventTypes as string[]).includes(input.kind);
        if (!wants) return;
        await sendEmail({
          to: m.email,
          subject: input.title,
          text: input.body ?? input.title,
          href,
        });
      }),
    );
  }

  try {
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
    const slackLink =
      input.href && ws
        ? `\n<${appUrl(`/w/${ws.slug}${input.href}`)}|Open in Augmentic>`
        : "";
    await executeTool(
      "slack.post_message",
      {
        channel,
        text: `*${input.title}*${input.body ? `\n${input.body}` : ""}${slackLink}`,
      },
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
