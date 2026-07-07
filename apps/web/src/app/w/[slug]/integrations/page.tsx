import { eq } from "drizzle-orm";
import { integrationConnections, mcpServers } from "@augmentic/db";
import { CONNECTOR_PROVIDERS, TOOL_CATALOG } from "@augmentic/shared";
import { isOAuthConfigured, type McpToolInfo } from "@augmentic/connectors";
import { requireWorkspace, roleAtLeast } from "@/lib/context";
import {
  connectDemoAction,
  disconnectIntegrationAction,
} from "@/lib/actions/integration-actions";
import { addMcpServerAction, removeMcpServerAction } from "@/lib/actions/mcp-actions";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  RiskBadge,
  StatusBadge,
} from "@/components/ui";

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const canManage = roleAtLeast(ctx.role, "admin");
  const connections = await ctx.db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.workspaceId, ctx.workspace.id));
  const connByProvider = new Map(connections.map((c) => [c.provider, c]));
  const mcpRows = await ctx.db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.workspaceId, ctx.workspace.id));

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect the tools your business already uses. Every tool carries a risk tier and per-agent permissions."
      />
      <div className="grid grid-cols-2 gap-4">
        {CONNECTOR_PROVIDERS.map((p) => {
          const conn = connByProvider.get(p.provider);
          const tools = TOOL_CATALOG.filter((t) =>
            (p.subProviders as readonly string[]).includes(t.provider),
          );
          const oauthReady = isOAuthConfigured(p.provider);
          return (
            <Card key={p.provider}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-slate-900">{p.label}</p>
                  <p className="text-sm text-slate-500">{p.description}</p>
                </div>
                {conn ? (
                  <StatusBadge status={conn.healthStatus} />
                ) : (
                  <StatusBadge status="disconnected" />
                )}
              </div>
              {conn && (
                <p className="mt-2 text-xs text-slate-400">
                  {conn.accountLabel}
                  {conn.isDemo && <span className="ml-1 text-purple-600">(demo)</span>} · scopes:{" "}
                  {(conn.scopes as string[]).join(", ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tools.map((t) => (
                  <span key={t.name} className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                    {t.name} <RiskBadge tier={t.riskTier} />
                  </span>
                ))}
              </div>
              {canManage && (
                <div className="mt-4 flex gap-2">
                  {conn ? (
                    <form action={disconnectIntegrationAction.bind(null, slug, p.provider)}>
                      <Button variant="secondary" type="submit">Disconnect</Button>
                    </form>
                  ) : (
                    <>
                      {oauthReady && p.provider !== "webhook" && (
                        <a
                          href={`/api/oauth/${p.provider}/start?workspace=${slug}`}
                          className="inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
                        >
                          Connect with OAuth
                        </a>
                      )}
                      {p.provider !== "webhook" && (
                        <form action={connectDemoAction.bind(null, slug, p.provider)}>
                          <Button variant={oauthReady ? "secondary" : "primary"} type="submit">
                            Connect demo account
                          </Button>
                        </form>
                      )}
                      {p.provider === "webhook" && (
                        <p className="text-xs text-slate-400">
                          Webhook triggers are created per-workflow — no connection needed.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {!oauthReady && p.provider !== "webhook" && !conn && (
                <p className="mt-2 text-xs text-slate-400">
                  Real OAuth needs {p.provider === "google" ? "GOOGLE_CLIENT_ID/SECRET" : "SLACK_CLIENT_ID/SECRET"} in env.
                  Demo accounts use realistic sample data so you can try everything now.
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-10">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          Trusted MCP servers <span className="text-sm font-normal text-slate-400">(advanced)</span>
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Allowlist a Model Context Protocol server to open its tools to your agents. Every
          MCP call requires human approval and the exact payload shared is logged to the
          audit trail.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {mcpRows.map((server) => (
            <Card key={server.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{server.name}</p>
                  <p className="break-all text-xs text-slate-400">{server.url}</p>
                </div>
                <StatusBadge status={server.enabled ? "connected" : "paused"} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {((server.toolsCache ?? []) as McpToolInfo[]).map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600"
                    title={t.description}
                  >
                    mcp.{server.slug}.{t.name} <RiskBadge tier="external_send" />
                  </span>
                ))}
              </div>
              {canManage && (
                <form action={removeMcpServerAction.bind(null, slug, server.id)} className="mt-3">
                  <Button variant="secondary" type="submit">Remove</Button>
                </form>
              )}
            </Card>
          ))}
          {canManage && (
            <Card>
              <h3 className="mb-3 font-medium text-slate-900">Add MCP server</h3>
              <form action={addMcpServerAction.bind(null, slug)} className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input name="name" required placeholder="Internal tools" />
                </div>
                <div>
                  <Label>URL (Streamable HTTP endpoint)</Label>
                  <Input name="url" type="url" required placeholder="https://mcp.example.com/mcp" />
                </div>
                <div>
                  <Label>Bearer token (optional)</Label>
                  <Input name="authToken" type="password" placeholder="Stored encrypted" />
                </div>
                <Button type="submit">Discover tools & allowlist</Button>
                <p className="text-xs text-slate-400">
                  Registration calls tools/list as a health check and fails loudly if the
                  server is unreachable.
                </p>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
