import type { RunMode } from "@augmentic/shared";

export interface ConnectionInfo {
  id: string;
  provider: string;
  isDemo: boolean;
  accountLabel: string;
  // Decrypted OAuth access token for real connections (never persisted here).
  accessToken?: string;
  // Provider-specific extras (e.g. Xero tenant id).
  tenantId?: string;
}

export interface ToolExecutionContext {
  workspaceId: string;
  connection: ConnectionInfo | null;
  mode: RunMode;
  idempotencyKey?: string;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
) => Promise<unknown>;

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_connected"
      | "side_effect_blocked"
      | "not_implemented"
      | "provider_error"
      | "unknown_tool",
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
