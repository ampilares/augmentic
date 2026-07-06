import type { RiskTier } from "./enums";

// A tool exposed by a connector. The JSON schema for inputs is stored
// alongside so the server can validate every model-proposed call.
export interface ToolSpec {
  provider: string;
  name: string; // e.g. "gmail.search_messages"
  description: string;
  riskTier: RiskTier;
  inputSchema: Record<string, unknown>; // JSON schema (from zod)
}

// What the agent runtime proposes; the policy engine classifies it before
// anything executes.
export interface ProposedToolCall {
  toolName: string;
  args: Record<string, unknown>;
  rationale?: string;
}

export interface PolicyDecision {
  outcome: "allow" | "require_approval" | "deny";
  riskTier: RiskTier;
  reason: string;
}

export interface EvidenceItem {
  source: string; // e.g. "gmail:message:123" or "knowledge:<id>"
  title: string;
  content: string;
  untrusted: boolean;
}

export interface PlanStep {
  description: string;
  expectedTool?: string;
}

export interface AgentPlan {
  goal: string;
  steps: PlanStep[];
  expectedOutputs: string[];
  stepBudget: number;
}

export interface RunCostSummary {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}
