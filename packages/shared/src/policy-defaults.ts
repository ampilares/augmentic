import type { RiskTier, ToolPermissionSetting, AutonomyMode } from "./enums";

// MVP default policy per risk tier (Spec §7.1). These apply when an agent has
// no explicit tool_permission_policy row for a tool. Deterministic — the
// policy engine consumes this table outside the model.
export const TIER_DEFAULT_POLICY: Record<RiskTier, ToolPermissionSetting> = {
  read: "allow",
  draft: "allow",
  internal_write: "require_approval",
  external_send: "require_approval",
  publish: "require_approval",
  delete: "deny",
  spend: "deny",
  admin: "deny",
};

// Tiers that may NEVER auto-execute in MVP regardless of per-agent overrides.
export const ALWAYS_APPROVAL_TIERS: RiskTier[] = ["external_send", "publish"];
export const ALWAYS_DENY_TIERS: RiskTier[] = ["admin"];

// Autonomy mode tightening: draft_only demotes anything above draft to
// require_approval (or deny where the tier default is deny).
export const AUTONOMY_MAX_AUTO_TIER: Record<AutonomyMode, RiskTier> = {
  draft_only: "draft",
  ask_before_acting: "draft",
  ask_when_unsure: "internal_write",
  autonomous_low_risk: "internal_write",
};

export const RISK_TIER_LABELS: Record<RiskTier, string> = {
  read: "Read",
  draft: "Draft",
  internal_write: "Internal write",
  external_send: "External send",
  publish: "Publish",
  delete: "Delete",
  spend: "Spend / money",
  admin: "Admin / security",
};

export const RISK_TIER_DESCRIPTIONS: Record<RiskTier, string> = {
  read: "Reads data the connected account can already see.",
  draft: "Creates a draft that a human sends or discards.",
  internal_write: "Writes inside your workspace or internal tools.",
  external_send: "Sends a message to someone outside the workspace.",
  publish: "Publishes content publicly.",
  delete: "Permanently removes data.",
  spend: "Moves money or changes paid campaigns.",
  admin: "Changes permissions, users, or security settings.",
};
