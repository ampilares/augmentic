import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { memberships, workspaces, type Db } from "@augmentic/db";
import { getBootedDb } from "./boot";
import type { WorkspaceRole } from "@augmentic/shared";
import { getSessionUser, type SessionUser } from "./auth";

// Workspace-scoping context (Paperclip invariant): every service call flows
// through requireWorkspace, which resolves membership from the session. A
// user with no membership in a workspace can never obtain its context.

export interface WorkspaceContext {
  db: Db;
  user: SessionUser;
  workspace: { id: string; name: string; slug: string };
  role: WorkspaceRole;
}

const ROLE_POWER: Record<WorkspaceRole, number> = {
  viewer: 0,
  approver: 1,
  operator: 2,
  admin: 3,
  owner: 4,
};

export function roleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return ROLE_POWER[role] >= ROLE_POWER[min];
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

export class ForbiddenError extends Error {}

export async function getWorkspaceContext(
  workspaceSlug: string,
): Promise<WorkspaceContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const db = await getBootedDb();
  const rows = await db
    .select({
      wsId: workspaces.id,
      wsName: workspaces.name,
      wsSlug: workspaces.slug,
      role: memberships.role,
      settings: workspaces.settings,
    })
    .from(workspaces)
    .innerJoin(
      memberships,
      and(eq(memberships.workspaceId, workspaces.id), eq(memberships.userId, user.id)),
    )
    .where(eq(workspaces.slug, workspaceSlug));
  const row = rows[0];
  if (!row) return null;
  // Session-age policy (plan 3.3): a workspace can require sessions younger
  // than N hours; older sessions must sign in again to access it.
  const maxHours = (row.settings as { sessionMaxHours?: number } | null)
    ?.sessionMaxHours;
  if (
    maxHours &&
    maxHours > 0 &&
    Date.now() - user.sessionCreatedAt.getTime() > maxHours * 3_600_000
  ) {
    return null;
  }
  return {
    db,
    user,
    workspace: { id: row.wsId, name: row.wsName, slug: row.wsSlug },
    role: row.role,
  };
}

export async function requireWorkspace(
  workspaceSlug: string,
  minRole: WorkspaceRole = "viewer",
): Promise<WorkspaceContext> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const ctx = await getWorkspaceContext(workspaceSlug);
  if (!ctx) redirect("/workspaces");
  if (!roleAtLeast(ctx.role, minRole)) {
    throw new ForbiddenError(
      `Requires ${minRole} role; you are ${ctx.role} in this workspace.`,
    );
  }
  return ctx;
}
