"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { invitations, memberships, users } from "@augmentic/db";
import { getBootedDb } from "../boot";
import { signInSchema, signUpSchema } from "@augmentic/shared";
import { createSession, destroySession, hashPassword, verifyPassword } from "../auth";

export interface FormState {
  error?: string;
}

export async function signUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const db = await getBootedDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email));
  if (existing.length > 0) return { error: "An account with this email already exists" };
  const [user] = await db
    .insert(users)
    .values({
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: hashPassword(parsed.data.password),
    })
    .returning({ id: users.id });

  // Accept any pending invitations for this email.
  const pending = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.email, parsed.data.email), isNull(invitations.acceptedAt)));
  for (const invite of pending) {
    if (invite.expiresAt < new Date()) continue;
    await db.insert(memberships).values({
      workspaceId: invite.workspaceId,
      userId: user!.id,
      role: invite.role,
    });
    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id));
  }

  await createSession(user!.id);
  redirect("/workspaces");
}

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid email or password" };
  const db = await getBootedDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email));
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return { error: "Invalid email or password" };
  }
  await createSession(user.id);
  redirect("/workspaces");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/sign-in");
}
