// OAuth scaffolding for real connections. When client credentials are not
// configured in env, the UI offers demo connections instead — the product
// flow is identical either way.

export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
}

// Token exchanges run inside user-facing request handlers — fail fast.
const OAUTH_TIMEOUT_MS = 15_000;

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive.file",
      "openid",
      "email",
    ],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:history", "channels:read", "chat:write"],
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  monday: {
    authorizeUrl: "https://auth.monday.com/oauth2/authorize",
    tokenUrl: "https://auth.monday.com/oauth2/token",
    scopes: ["boards:read", "boards:write", "updates:write"],
    clientIdEnv: "MONDAY_CLIENT_ID",
    clientSecretEnv: "MONDAY_CLIENT_SECRET",
  },
  xero: {
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scopes: ["accounting.transactions.read", "accounting.contacts.read", "offline_access"],
    clientIdEnv: "XERO_CLIENT_ID",
    clientSecretEnv: "XERO_CLIENT_SECRET",
  },
};

export function isOAuthConfigured(provider: string): boolean {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) return false;
  return Boolean(process.env[cfg.clientIdEnv] && process.env[cfg.clientSecretEnv]);
}

export function getAuthorizeUrl(
  provider: string,
  redirectUri: string,
  state: string,
): string {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown OAuth provider ${provider}`);
  const clientId = process.env[cfg.clientIdEnv];
  if (!clientId) throw new Error(`${cfg.clientIdEnv} not configured`);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${cfg.authorizeUrl}?${params}`;
}

// Refresh an expired access token (Plan 2.6 hardening). Google and Xero
// tokens are short-lived; the engine retries once with a refreshed token on
// auth failure and re-encrypts the new secret.
export async function refreshAccessToken(
  provider: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown OAuth provider ${provider}`);
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env[cfg.clientIdEnv] ?? "",
      client_secret: process.env[cfg.clientSecretEnv] ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!json.access_token) {
    throw new Error(`Token refresh failed for ${provider}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return {
    accessToken: json.access_token as string,
    refreshToken: (json.refresh_token as string | undefined) ?? refreshToken,
  };
}

// Xero API calls require the tenant (organisation) id alongside the token.
export async function fetchXeroTenantId(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { tenantId?: string }[];
  return json[0]?.tenantId;
}

export async function exchangeCode(
  provider: string,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken?: string; raw: unknown }> {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown OAuth provider ${provider}`);
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env[cfg.clientIdEnv] ?? "",
      client_secret: process.env[cfg.clientSecretEnv] ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const json = (await res.json()) as Record<string, unknown>;
  const accessToken =
    (json.access_token as string) ??
    ((json.authed_user as Record<string, unknown>)?.access_token as string);
  if (!accessToken) {
    throw new Error(`OAuth exchange failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return {
    accessToken,
    refreshToken: json.refresh_token as string | undefined,
    raw: json,
  };
}
