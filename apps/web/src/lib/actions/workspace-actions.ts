"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  invitations,
  memberships,
  users,
  workspaces,
} from "@augmentic/db";
import { getBootedDb } from "../boot";
import { createWorkspaceSchema, inviteMemberSchema } from "@augmentic/shared";
import { recordActivationMetric, recordAudit } from "@augmentic/engine";
import { requireUser, requireWorkspace } from "../context";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(2).toString("hex")}`;
}

export async function createWorkspaceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createWorkspaceSchema.parse({ name: formData.get("name") });
  const db = await getBootedDb();
  const slug = slugify(parsed.name);
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: parsed.name,
      slug,
      // 14-day Growth trial (plan 2.5): roomy enough for the onboarding pack;
      // limits drop to Starter when it lapses unless a plan is chosen.
      settings: { trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString() },
    })
    .returning({ id: workspaces.id, slug: workspaces.slug });
  await db.insert(memberships).values({
    workspaceId: ws!.id,
    userId: user.id,
    role: "owner",
  });
  await recordAudit(db, {
    workspaceId: ws!.id,
    actorType: "user",
    actorId: user.id,
    actorLabel: user.email,
    eventType: "workspace.created",
    entityType: "workspace",
    entityId: ws!.id,
    payload: { name: parsed.name },
  });
  await recordActivationMetric(db, ws!.id, "workspace_created");
  redirect(`/w/${ws!.slug}/onboarding`);
}

export async function inviteMemberAction(
  workspaceSlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const parsed = inviteMemberSchema.parse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  // Allowed-domain policy (plan 3.3): when configured, invites outside the
  // list are rejected server-side.
  const [wsRow] = await ctx.db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id));
  const allowed = (wsRow?.settings as { allowedEmailDomains?: string[] } | null)
    ?.allowedEmailDomains;
  if (allowed && allowed.length > 0) {
    const domain = parsed.email.split("@")[1]?.toLowerCase() ?? "";
    if (!allowed.includes(domain)) {
      throw new Error(
        `Invites are restricted to: ${allowed.join(", ")}. Ask an admin to update the allowed domains in Settings.`,
      );
    }
  }
  // Existing user: add membership directly. Otherwise create an invitation.
  const [existingUser] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.email));
  if (existingUser) {
    const existing = await ctx.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, ctx.workspace.id),
          eq(memberships.userId, existingUser.id),
        ),
      );
    if (existing.length === 0) {
      await ctx.db.insert(memberships).values({
        workspaceId: ctx.workspace.id,
        userId: existingUser.id,
        role: parsed.role,
      });
    }
  } else {
    await ctx.db.insert(invitations).values({
      workspaceId: ctx.workspace.id,
      email: parsed.email,
      role: parsed.role,
      token: crypto.randomBytes(24).toString("hex"),
      invitedByUserId: ctx.user.id,
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    });
  }
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "member.invited",
    payload: { email: parsed.email, role: parsed.role },
  });
  revalidatePath(`/w/${workspaceSlug}/team`);
}

export async function updateMemberRoleAction(
  workspaceSlug: string,
  membershipId: string,
  role: string,
): Promise<void> {
  const ctx = await requireWorkspace(workspaceSlug, "admin");
  const valid = inviteMemberSchema.shape.role.parse(role);
  await ctx.db
    .update(memberships)
    .set({ role: valid, updatedAt: new Date() })
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.workspaceId, ctx.workspace.id),
      ),
    );
  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "member.role_changed",
    entityType: "membership",
    entityId: membershipId,
    payload: { role: valid },
  });
  revalidatePath(`/w/${workspaceSlug}/team`);
}
