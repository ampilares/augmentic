import type {
  AgentPlan,
  AutonomyMode,
  EvidenceItem,
  ProposedToolCall,
  ToolSpec,
} from "@augmentic/shared";

export interface AgentIdentity {
  name: string;
  roleTitle: string;
  jobDescription: string;
  autonomyMode: AutonomyMode;
}

export interface BrandContext {
  tone?: string;
  offerings?: string;
  icp?: string;
  forbiddenClaims?: string;
  escalationRules?: string;
  facts?: string;
}

export interface AgentContext {
  agent: AgentIdentity;
  brand: BrandContext | null;
  memories: string[];
  skills: { name: string; instructions: string }[];
  workflowInstructions: string;
  deliveryHint?: string;
  triggerPayload?: unknown;
  availableTools: ToolSpec[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  provider: string;
  model: string;
}

export interface PlanResult {
  plan: AgentPlan;
  usage: Usage;
}

export interface EvidenceProposal {
  calls: ProposedToolCall[];
  done: boolean;
  usage: Usage;
}

export interface DraftResult {
  output: string;
  proposedActions: ProposedToolCall[];
  usage: Usage;
}

export interface AgentRuntime {
  providerName: string;
  plan(ctx: AgentContext): Promise<PlanResult>;
  proposeEvidenceCalls(
    ctx: AgentContext,
    plan: AgentPlan,
    evidence: EvidenceItem[],
    round: number,
  ): Promise<EvidenceProposal>;
  draft(
    ctx: AgentContext,
    plan: AgentPlan,
    evidence: EvidenceItem[],
    revisionFeedback?: string,
  ): Promise<DraftResult>;
}
