import {
  integrationConnections,
  memberships,
  notifications,
  notificationSubscriptions,
  users,
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
    .select({ userId: memberships.userId, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
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

  // Email fan-out (FR-021): opt-in per user via notification_subscriptions,
  // delivered through Resend when RESEND_API_KEY is configured.
  if (process.env.RESEND_API_KEY && members.length > 0) {
    try {
      const subs = await db
        .select()
        .from(notificationSubscriptions)
        .where(
          and(
            eq(notificationSubscriptions.workspaceId, input.workspaceId),
            eq(notificationSubscriptions.channel, "email"),
          ),
        );
      const subscribed = new Set(
        subs
          .filter((s) => {
            const types = (s.eventTypes ?? []) as string[];
            return types.includes("all") || types.includes(input.kind);
          })
          .map((s) => s.userId),
      );
      const baseUrl = process.env.AUGMENTIC_BASE_URL ?? "http://localhost:3000";
      for (const m of members.filter((x) => subscribed.has(x.userId))) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.AUGMENTIC_EMAIL_FROM ?? "Augmentic <alerts@augmentic.app>",
            to: m.email,
            subject: input.title,
            text: `${input.title}\n\n${input.body ?? ""}${input.href ? `\n\nOpen: ${baseUrl}${input.href}` : ""}`,
          }),
        });
      }
    } catch {
      // Email delivery is best-effort.
    }
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
