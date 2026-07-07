// Canonical enums shared by db, engine, policy, connectors, and UI.
// Contract-sync rule: changing any of these requires updating db schema,
// server services, and UI in the same change (Spec §3.3).

export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "operator",
  "approver",
  "viewer",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const AGENT_STATUSES = [
  "active",
  "paused",
  "needs_setup",
  "blocked",
  "error",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AUTONOMY_MODES = [
  "draft_only",
  "ask_before_acting",
  "ask_when_unsure",
  "autonomous_low_risk",
] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

// Ordered from least to most dangerous (Spec §7.1).
export const RISK_TIERS = [
  "read",
  "draft",
  "internal_write",
  "external_send",
  "publish",
  "delete",
  "spend",
  "admin",
] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const TOOL_PERMISSION_SETTINGS = [
  "allow",
  "require_approval",
  "deny",
] as const;
export type ToolPermissionSetting = (typeof TOOL_PERMISSION_SETTINGS)[number];

export const WORKFLOW_STATUSES = [
  "draft",
  "ready",
  "active",
  "paused",
  "blocked",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const TRIGGER_TYPES = [
  "manual",
  "schedule",
  "webhook",
  "app_event",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// The 11-step run lifecycle (Spec §5).
export const RUN_STEP_TYPES = [
  "trigger",
  "preflight",
  "plan",
  "evidence",
  "draft",
  "risk_classify",
  "approval",
  "execute",
  "verify",
  "deliver",
  "ledger",
] as const;
export type RunStepType = (typeof RUN_STEP_TYPES)[number];

export const RUN_STEP_STATUSES = [
  "running",
  "succeeded",
  "failed",
  "skipped",
  "waiting",
] as const;
export type RunStepStatus = (typeof RUN_STEP_STATUSES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "edited",
  "revision_requested",
  "expired",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const RUN_MODES = ["live", "simulation", "chat"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const CONNECTION_HEALTH = [
  "connected",
  "needs_reauth",
  "missing_permission",
  "error",
  "disconnected",
] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTH)[number];

export const ORG_NODE_TYPES = [
  "human",
  "agent",
  "department",
  "workflow",
  "tool",
  "approval_queue",
] as const;
export type OrgNodeType = (typeof ORG_NODE_TYPES)[number];

export const ORG_EDGE_TYPES = [
  "supervises",
  "triggers",
  "uses_tool",
  "hands_off",
  "routes_approval",
  "delivers_to",
] as const;
export type OrgEdgeType = (typeof ORG_EDGE_TYPES)[number];

export const KNOWLEDGE_SOURCE_TYPES = ["upload", "link", "text"] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const DELIVERY_TARGETS = [
  "run_log",
  "slack_channel",
  "email_draft",
] as const;
export type DeliveryTarget = (typeof DELIVERY_TARGETS)[number];

export const AUDIT_ACTOR_TYPES = ["user", "agent", "system", "external"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const USAGE_KINDS = [
  "model_tokens",
  "tool_call",
  "run",
  "credit",
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export const MEMORY_KINDS = [
  "fact",
  "preference",
  "sop",
  "escalation_rule",
  "forbidden_action",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

// Activation metrics instrumented from day one (Spec §14).
export const METRIC_EVENTS = [
  "workspace_created",
  "first_integration_connected",
  "first_agent_created",
  "first_workflow_simulated",
  "first_workflow_run_completed",
  "first_approval_completed",
] as const;
export type MetricEvent = (typeof METRIC_EVENTS)[number];

// Notification kinds fanned out by the engine (FR-021). Order matches the
// preference checkboxes on the notifications page.
export const NOTIFICATION_KINDS = [
  "approval_pending",
  "run_failed",
  "run_blocked",
  "budget_hard_stop",
  "weekly_summary",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  approval_pending: "Approval waiting on you",
  run_failed: "Workflow run failed",
  run_blocked: "Workflow run blocked",
  budget_hard_stop: "Agent hit its spend cap",
  weekly_summary: "Weekly value summary",
};
