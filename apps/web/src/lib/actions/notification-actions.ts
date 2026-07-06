"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { notifications, workspaces } from "@augmentic/db";
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

export async function saveWorkspaceSettingsAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const [ws] = await ctx.db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id));
  const settings = {
    ...((ws?.settings as Record<string, unknown>) ?? {}),
    notificationsSlackChannel:
      String(formData.get("notificationsSlackChannel") ?? "").trim() || undefined,
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
    payload: { notificationsSlackChannel: settings.notificationsSlackChannel ?? null },
  });
  revalidatePath(`/w/${workspaceSlug}/settings`);
}
