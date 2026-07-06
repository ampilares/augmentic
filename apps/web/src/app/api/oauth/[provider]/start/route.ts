import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthorizeUrl, isOAuthConfigured } from "@augmentic/connectors";
import { requireWorkspace } from "@/lib/context";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const workspaceSlug = url.searchParams.get("workspace") ?? "";
  await requireWorkspace(workspaceSlug, "admin");
  if (!isOAuthConfigured(provider)) {
    return Response.json({ error: `${provider} OAuth not configured` }, { status: 400 });
  }
  const state = `${crypto.randomBytes(16).toString("hex")}:${workspaceSlug}`;
  const store = await cookies();
  store.set("oauth_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  const redirectUri = `${url.origin}/api/oauth/${provider}/callback`;
  redirect(getAuthorizeUrl(provider, redirectUri, state));
}
