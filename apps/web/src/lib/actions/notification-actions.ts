"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { notificationSubscriptions, notifications, workspaces } from "@augmentic/db";
import { NOTIFICATION_KINDS } from "@augmentic/shared";
import { recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "../context";

export async function markAllNotificationsReadAction(
  workspaceSlug: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug);
  await ctx.db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, ctx.workspace.id),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    );
  revalidatePath(`/w/${workspaceSlug}/notifications`);
  revalidatePath(`/w/${workspaceSlug}`, "layout");
}

// Per-user email preferences (FR-021). No subscription row means the default:
// every kind enabled. A row stores the explicit list the user still wants.
export async function saveNotificationPrefsAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug);
  const enabled = NOTIFICATION_KINDS.filter((kind) => formData.get(kind) === "on");
  const allEnabled = enabled.length === NOTIFICATION_KINDS.length;
  const where = and(
    eq(notificationSubscriptions.workspaceId, ctx.workspace.id),
    eq(notificationSubscriptions.userId, ctx.user.id),
    eq(notificationSubscriptions.channel, "email"),
  );
  const [existing] = await ctx.db.select().from(notificationSubscriptions).where(where);
  if (allEnabled) {
    // Back to the default — drop the override row.
    if (existing) await ctx.db.delete(notificationSubscriptions).where(where);
  } else if (existing) {
    await ctx.db
      .update(notificationSubscriptions)
      .set({ eventTypes: enabled })
      .where(where);
  } else {
    await ctx.db.insert(notificationSubscriptions).values({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      channel: "email",
      eventTypes: enabled,
    });
  }
  revalidatePath(`/w/${workspaceSlug}/notifications`);
}

export async function saveWorkspaceSettingsAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const [ws] = await ctx.db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id));
  const existing = (ws?.settings as Record<string, unknown>) ?? {};
  // Fields absent from the form keep their current value, so independent
  // settings forms don't clobber each other; blank = clear.
  const textField = (name: string): unknown => {
    const raw = formData.get(name);
    if (raw === null) return existing[name];
    return String(raw).trim() || undefined;
  };
  const daysField = (name: string): unknown => {
    const raw = formData.get(name);
    if (raw === null) return existing[name];
    const days = Math.floor(Number(String(raw).trim()));
    return Number.isFinite(days) && days > 0 ? days : undefined;
  };
  // Security controls (3.3) are only editable through the security form,
  // which includes a marker field so other forms can't clear them.
  const securitySubmitted = formData.get("securityForm") !== null;
  const domainsRaw = String(formData.get("allowedEmailDomains") ?? "").trim();
  const allowedEmailDomains = domainsRaw
    ? domainsRaw
        .split(/[,\s]+/)
        .map((d) => d.toLowerCase().replace(/^@/, ""))
        .filter(Boolean)
    : undefined;
  const settings = {
    ...existing,
    notificationsSlackChannel: textField("notificationsSlackChannel"),
    // Data retention (2.6): unset = keep forever. Runs/notifications and
    // audit are governed separately.
    retentionDays: daysField("retentionDays"),
    auditRetentionDays: daysField("auditRetentionDays"),
    ...(securitySubmitted
      ? {
          strictApprovals: formData.get("strictApprovals") === "on" || undefined,
          allowedEmailDomains,
          sessionMaxHours: daysField("sessionMaxHours"),
        }
      : {}),
  };
  await ctx.db
    .update(workspaces)
    .set({ settings, updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspace.id));
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "workspace.settings_updated",
    payload: {
      notificationsSlackChannel: settings.notificationsSlackChannel ?? null,
      retentionDays: settings.retentionDays ?? null,
      auditRetentionDays: settings.auditRetentionDays ?? null,
      ...(securitySubmitted
        ? {
            strictApprovals: settings.strictApprovals ?? false,
            allowedEmailDomains: settings.allowedEmailDomains ?? null,
            sessionMaxHours: settings.sessionMaxHours ?? null,
          }
        : {}),
    },
  });
  revalidatePath(`/w/${workspaceSlug}/settings`);
}
