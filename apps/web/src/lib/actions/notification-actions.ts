"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import {
  notifications,
  notificationSubscriptions,
  workspaces,
} from "@augmentic/db";
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

// Per-user email preference (FR-021 notification_subscription).
export async function toggleEmailNotificationsAction(
  workspaceSlug: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug);
  const [existing] = await ctx.db
    .select()
    .from(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.workspaceId, ctx.workspace.id),
        eq(notificationSubscriptions.userId, ctx.user.id),
        eq(notificationSubscriptions.channel, "email"),
      ),
    );
  if (existing) {
    await ctx.db
      .delete(notificationSubscriptions)
      .where(eq(notificationSubscriptions.id, existing.id));
  } else {
    await ctx.db.insert(notificationSubscriptions).values({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      channel: "email",
      eventTypes: ["all"],
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
  const retentionRaw = String(formData.get("retentionDays") ?? "").trim();
  const retentionDays = retentionRaw === "" ? undefined : Math.max(7, Number(retentionRaw));
  const allowedInviteDomains = String(formData.get("allowedInviteDomains") ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const settings = {
    ...((ws?.settings as Record<string, unknown>) ?? {}),
    notificationsSlackChannel:
      String(formData.get("notificationsSlackChannel") ?? "").trim() || undefined,
    retentionDays: Number.isFinite(retentionDays) ? retentionDays : undefined,
    allowedInviteDomains:
      allowedInviteDomains.length > 0 ? allowedInviteDomains : undefined,
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
      allowedInviteDomains: settings.allowedInviteDomains ?? null,
    },
  });
  revalidatePath(`/w/${workspaceSlug}/settings`);
}
