import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { integrationConnections, secretRefs } from "@augmentic/db";
import { exchangeCode, OAUTH_PROVIDERS } from "@augmentic/connectors";
import { encryptSecret, recordActivationMetric, recordAudit } from "@augmentic/engine";
import { requireWorkspace } from "@/lib/context";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const store = await cookies();
  const savedState = store.get("oauth_state")?.value;
  if (!code || !savedState || savedState !== state) {
    return Response.json({ error: "invalid oauth state" }, { status: 400 });
  }
  const workspaceSlug = state.split(":")[1] ?? "";
  const ctx = await requireWorkspace(workspaceSlug, "admin");

  const redirectUri = `${url.origin}/api/oauth/${provider}/callback`;
  const tokens = await exchangeCode(provider, code, redirectUri);

  const [secret] = await ctx.db
    .insert(secretRefs)
    .values({
      workspaceId: ctx.workspace.id,
      ciphertext: encryptSecret(
        JSON.stringify({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        }),
      ),
    })
    .returning({ id: secretRefs.id });

  const existing = await ctx.db
    .select({ id: integrationConnections.id })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.workspaceId, ctx.workspace.id),
        eq(integrationConnections.provider, provider),
      ),
    );
  const values = {
    accountLabel: `${provider} (OAuth)`,
    scopes: OAUTH_PROVIDERS[provider]?.scopes ?? [],
    secretRefId: secret!.id,
    healthStatus: "connected" as const,
    isDemo: false,
    connectedByUserId: ctx.user.id,
    updatedAt: new Date(),
  };
  if (existing.length > 0) {
    await ctx.db
      .update(integrationConnections)
      .set(values)
      .where(eq(integrationConnections.id, existing[0]!.id));
  } else {
    await ctx.db.insert(integrationConnections).values({
      workspaceId: ctx.workspace.id,
      provider,
      ...values,
    });
  }

  await recordAudit(ctx.db, {
    workspaceId: ctx.workspace.id,
    actorType: "user",
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: "integration.connected",
    payload: { provider, demo: false },
  });
  await recordActivationMetric(ctx.db, ctx.workspace.id, "first_integration_connected");

  redirect(`/w/${workspaceSlug}/integrations`);
}
