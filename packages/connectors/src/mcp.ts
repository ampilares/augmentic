import { ConnectorError } from "./types";

// Minimal MCP client over Streamable HTTP (JSON-RPC 2.0). Only two methods
// are needed: tools/list at registration and tools/call at execution. Every
// call is approval-gated upstream and its payload logged (Spec §7.2).

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

let rpcId = 1;

// An unresponsive MCP server must fail the tool call, not hang the run step
// (the engine retries with idempotency keys; a hang blocks a worker slot).
const MCP_TIMEOUT_MS = 30_000;

async function mcpRpc(
  url: string,
  method: string,
  params: Record<string, unknown>,
  authToken?: string,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new ConnectorError(
      `MCP server ${res.status}: ${(await res.text()).slice(0, 200)}`,
      "provider_error",
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  let json: { result?: unknown; error?: { message?: string } };
  if (contentType.includes("text/event-stream")) {
    // Single-response SSE frame (Streamable HTTP servers may answer this way).
    const text = await res.text();
    const dataLine = text
      .split("\n")
      .find((l) => l.startsWith("data:"));
    if (!dataLine) throw new ConnectorError("MCP: empty SSE response", "provider_error");
    json = JSON.parse(dataLine.slice(5).trim());
  } else {
    json = (await res.json()) as typeof json;
  }
  if (json.error) {
    throw new ConnectorError(
      `MCP error: ${json.error.message ?? "unknown"}`,
      "provider_error",
    );
  }
  return json.result;
}

export async function discoverMcpTools(
  url: string,
  authToken?: string,
): Promise<McpToolInfo[]> {
  const result = (await mcpRpc(url, "tools/list", {}, authToken)) as {
    tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[];
  };
  return (result.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema ?? { type: "object" },
  }));
}

export async function callMcpTool(
  url: string,
  toolName: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<unknown> {
  const result = (await mcpRpc(
    url,
    "tools/call",
    { name: toolName, arguments: args },
    authToken,
  )) as { content?: unknown; isError?: boolean };
  if (result.isError) {
    throw new ConnectorError(
      `MCP tool ${toolName} returned an error: ${JSON.stringify(result.content).slice(0, 300)}`,
      "provider_error",
    );
  }
  return result.content ?? result;
}
