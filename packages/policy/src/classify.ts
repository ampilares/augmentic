import {
  ALWAYS_APPROVAL_TIERS,
  ALWAYS_DENY_TIERS,
  AUTONOMY_MAX_AUTO_TIER,
  RISK_TIERS,
  TIER_DEFAULT_POLICY,
  type AutonomyMode,
  type PolicyDecision,
  type RiskTier,
  type RunMode,
  type ToolPermissionSetting,
} from "@augmentic/shared";

export interface ClassifyInput {
  toolName: string;
  riskTier: RiskTier;
  autonomyMode: AutonomyMode;
  // Explicit per-agent tool_permission_policy row, if one exists.
  agentPermission?: ToolPermissionSetting;
  mode: RunMode;
}

const tierRank = (tier: RiskTier) => RISK_TIERS.indexOf(tier);

// Deterministic risk classification (Spec §5 step 6, §7.1). This runs
// server-side for every model-proposed tool call, in every surface
// (workflow, chat, simulation). The model has no influence over the outcome.
export function classifyToolCall(input: ClassifyInput): PolicyDecision {
  const { toolName, riskTier, autonomyMode, agentPermission, mode } = input;

  // Hard floors that no per-agent setting can loosen in MVP.
  if (ALWAYS_DENY_TIERS.includes(riskTier)) {
    return {
      outcome: "deny",
      riskTier,
      reason: `${toolName} is ${riskTier}-tier; agents may never perform admin/security actions in MVP.`,
    };
  }

  const base = agentPermission ?? TIER_DEFAULT_POLICY[riskTier];

  if (base === "deny") {
    return {
      outcome: "deny",
      riskTier,
      reason:
        agentPermission === "deny"
          ? `${toolName} is explicitly denied for this agent.`
          : `${riskTier}-tier tools are denied by default policy.`,
    };
  }

  // Simulation never executes side effects: anything above draft is reported
  // as would-require-approval, and nothing external runs (enforced again at
  // the connector layer).
  if (mode === "simulation" && tierRank(riskTier) > tierRank("draft")) {
    return {
      outcome: "require_approval",
      riskTier,
      reason: `Simulation: ${toolName} (${riskTier}) would ${base === "allow" ? "execute" : "request approval"} in a live run. No side effects in simulation.`,
    };
  }

  // MVP floor: external sends and publishes always require approval even if
  // the agent-level setting says allow (Spec §7.1 bold rows).
  if (ALWAYS_APPROVAL_TIERS.includes(riskTier)) {
    return {
      outcome: "require_approval",
      riskTier,
      reason: `${riskTier} actions always require human approval in MVP.`,
    };
  }

  if (base === "require_approval") {
    return {
      outcome: "require_approval",
      riskTier,
      reason:
        agentPermission === "require_approval"
          ? `${toolName} is set to require approval for this agent.`
          : `${riskTier}-tier tools require approval by default.`,
    };
  }

  // base === "allow": autonomy mode can still tighten (draft_only demotes
  // anything above its max auto tier to approval).
  const maxAuto = AUTONOMY_MAX_AUTO_TIER[autonomyMode];
  if (tierRank(riskTier) > tierRank(maxAuto)) {
    return {
      outcome: "require_approval",
      riskTier,
      reason: `Agent autonomy is '${autonomyMode}' (auto-execute up to ${maxAuto}); ${toolName} is ${riskTier}.`,
    };
  }

  return {
    outcome: "allow",
    riskTier,
    reason: `${toolName} (${riskTier}) is allowed for this agent.`,
  };
}
