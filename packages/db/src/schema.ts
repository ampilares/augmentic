import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  WorkspaceRole,
  AgentStatus,
  AutonomyMode,
  RiskTier,
  ToolPermissionSetting,
  WorkflowStatus,
  TriggerType,
  RunStatus,
  RunStepType,
  RunStepStatus,
  ApprovalStatus,
  RunMode,
  ConnectionHealth,
  OrgNodeType,
  OrgEdgeType,
  KnowledgeSourceType,
  AuditActorType,
  UsageKind,
  MemoryKind,
} from "@augmentic/shared";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Tenancy & identity (Spec §4.1)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").notNull().default({}),
  onboardingProfile: jsonb("onboarding_profile"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_ws_user_idx").on(t.workspaceId, t.userId),
  ],
);

export const invitations = pgTable("invitations", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").$type<WorkspaceRole>().notNull(),
  token: text("token").notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Agents & Work Chart (Spec §4.2)
// ---------------------------------------------------------------------------

export const agentTemplates = pgTable("agent_templates", {
  id: id(),
  // Templates are global (seeded); workspace_id null means built-in.
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  slug: text("slug").notNull().unique(),
  roleTitle: text("role_title").notNull(),
  shortPitch: text("short_pitch").notNull(),
  jobDescription: text("job_description").notNull(),
  defaultSkills: jsonb("default_skills").notNull().default([]),
  appDependencies: jsonb("app_dependencies").notNull().default([]),
  defaultWorkflowSlugs: jsonb("default_workflow_slugs").notNull().default([]),
  approvalPolicyDefaults: jsonb("approval_policy_defaults")
    .notNull()
    .default({}),
  setupQuestions: jsonb("setup_questions").notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const agents = pgTable(
  "agents",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => agentTemplates.id),
    name: text("name").notNull(),
    roleTitle: text("role_title").notNull(),
    jobDescription: text("job_description").notNull(),
    status: text("status").$type<AgentStatus>().notNull().default("needs_setup"),
    autonomyMode: text("autonomy_mode")
      .$type<AutonomyMode>()
      .notNull()
      .default("draft_only"),
    supervisorUserId: uuid("supervisor_user_id").references(() => users.id),
    spendCapMonthlyCents: integer("spend_cap_monthly_cents"),
    avatar: text("avatar"),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("agents_ws_idx").on(t.workspaceId)],
);

export const orgNodes = pgTable(
  "org_nodes",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    nodeType: text("node_type").$type<OrgNodeType>().notNull(),
    refId: uuid("ref_id"),
    label: text("label").notNull(),
    parentNodeId: uuid("parent_node_id"),
    position: jsonb("position"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("org_nodes_ws_idx").on(t.workspaceId)],
);

export const orgEdges = pgTable(
  "org_edges",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fromNodeId: uuid("from_node_id")
      .notNull()
      .references(() => orgNodes.id, { onDelete: "cascade" }),
    toNodeId: uuid("to_node_id")
      .notNull()
      .references(() => orgNodes.id, { onDelete: "cascade" }),
    edgeType: text("edge_type").$type<OrgEdgeType>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("org_edges_ws_idx").on(t.workspaceId)],
);

export const skills = pgTable("skills", {
  id: id(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  instructions: text("instructions").notNull(),
  inputSchema: jsonb("input_schema"),
  outputSchema: jsonb("output_schema"),
  allowedTools: jsonb("allowed_tools").notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const agentSkills = pgTable(
  "agent_skills",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_skills_unique_idx").on(t.agentId, t.skillId)],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MemoryKind>().notNull(),
    content: text("content").notNull(),
    sourceRunId: uuid("source_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("memory_items_agent_idx").on(t.agentId)],
);

// ---------------------------------------------------------------------------
// Integrations & tools (Spec §4.3)
// ---------------------------------------------------------------------------

export const secretRefs = pgTable("secret_refs", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  kmsKeyRef: text("kms_key_ref").notNull().default("local-dev"),
  ciphertext: text("ciphertext").notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accountLabel: text("account_label").notNull(),
    scopes: jsonb("scopes").notNull().default([]),
    secretRefId: uuid("secret_ref_id").references(() => secretRefs.id),
    healthStatus: text("health_status")
      .$type<ConnectionHealth>()
      .notNull()
      .default("connected"),
    // Demo-mode connections simulate provider data so the e2e loop works
    // without real OAuth credentials.
    isDemo: boolean("is_demo").notNull().default(false),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integration_ws_provider_idx").on(t.workspaceId, t.provider),
  ],
);

export const toolDefinitions = pgTable(
  "tool_definitions",
  {
    id: id(),
    provider: text("provider").notNull(),
    name: text("name").notNull().unique(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema").notNull(),
    riskTier: text("risk_tier").$type<RiskTier>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tool_defs_provider_idx").on(t.provider)],
);

export const toolPermissionPolicies = pgTable(
  "tool_permission_policies",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    toolDefinitionId: uuid("tool_definition_id")
      .notNull()
      .references(() => toolDefinitions.id, { onDelete: "cascade" }),
    setting: text("setting").$type<ToolPermissionSetting>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tool_perm_unique_idx").on(t.agentId, t.toolDefinitionId),
  ],
);

// ---------------------------------------------------------------------------
// Knowledge & brand (Spec §4.4)
// ---------------------------------------------------------------------------

export const knowledgeCollections = pgTable("knowledge_collections", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  scope: text("scope").$type<"workspace" | "agent">().notNull(),
  agentId: uuid("agent_id").references(() => agents.id, {
    onDelete: "cascade",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => knowledgeCollections.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<KnowledgeSourceType>().notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    url: text("url"),
    // Embedding stored as JSON array; pgvector upgrade is a follow-up that
    // doesn't change the retrieval interface.
    embedding: jsonb("embedding"),
    tags: jsonb("tags").notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("knowledge_items_ws_idx").on(t.workspaceId)],
);

export const brandProfiles = pgTable("brand_profiles", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" })
    .unique(),
  tone: text("tone").notNull().default(""),
  offerings: text("offerings").notNull().default(""),
  icp: text("icp").notNull().default(""),
  competitors: text("competitors").notNull().default(""),
  pricingNotes: text("pricing_notes").notNull().default(""),
  escalationRules: text("escalation_rules").notNull().default(""),
  forbiddenClaims: text("forbidden_claims").notNull().default(""),
  facts: text("facts").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Workflows & runs (Spec §4.5)
// ---------------------------------------------------------------------------

export const workflowTemplates = pgTable("workflow_templates", {
  id: id(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  instructions: text("instructions").notNull(),
  dependencies: jsonb("dependencies").notNull().default([]),
  sampleOutput: text("sample_output").notNull(),
  triggerOptions: jsonb("trigger_options").notNull().default([]),
  defaultRoleSlug: text("default_role_slug"),
  requiredScopes: jsonb("required_scopes").notNull().default([]),
  defaultApprovalPolicy: jsonb("default_approval_policy").notNull().default({}),
  successMetric: text("success_metric").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workflows = pgTable(
  "workflows",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => workflowTemplates.id),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    deliveryConfig: jsonb("delivery_config").notNull().default({}),
    approvalPolicy: jsonb("approval_policy").notNull().default({}),
    status: text("status").$type<WorkflowStatus>().notNull().default("draft"),
    lastSimulatedAt: timestamp("last_simulated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("workflows_ws_idx").on(t.workspaceId)],
);

export const workflowTriggers = pgTable(
  "workflow_triggers",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").$type<TriggerType>().notNull(),
    config: jsonb("config").notNull().default({}),
    webhookToken: text("webhook_token").unique(),
    webhookSecret: text("webhook_secret"),
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("triggers_next_fire_idx").on(t.nextFireAt)],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    mode: text("mode").$type<RunMode>().notNull().default("live"),
    triggerType: text("trigger_type").$type<TriggerType>().notNull(),
    triggerSnapshot: jsonb("trigger_snapshot").notNull().default({}),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    statusReason: text("status_reason"),
    // Durable resume state: which lifecycle phase to (re-)enter and any
    // saved context (plan, drafts, pending tool call). Engine-agnostic.
    resumeState: jsonb("resume_state"),
    // Execution lock for atomic checkout (no double-work).
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("runs_ws_idx").on(t.workspaceId),
    index("runs_status_idx").on(t.status),
  ],
);

export const agentRuns = pgTable("agent_runs", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workflowRunId: uuid("workflow_run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  plan: jsonb("plan"),
  modelUsage: jsonb("model_usage").notNull().default({}),
  status: text("status").$type<RunStatus>().notNull().default("running"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const runSteps = pgTable(
  "run_steps",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "cascade",
    }),
    seq: integer("seq").notNull(),
    stepType: text("step_type").$type<RunStepType>().notNull(),
    status: text("status").$type<RunStepStatus>().notNull().default("running"),
    title: text("title").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("run_steps_run_idx").on(t.workflowRunId)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    runStepId: uuid("run_step_id").references(() => runSteps.id, {
      onDelete: "set null",
    }),
    toolDefinitionId: uuid("tool_definition_id").references(
      () => toolDefinitions.id,
    ),
    toolName: text("tool_name").notNull(),
    connectionId: uuid("connection_id").references(
      () => integrationConnections.id,
    ),
    args: jsonb("args").notNull().default({}),
    result: jsonb("result"),
    error: text("error"),
    idempotencyKey: text("idempotency_key"),
    riskTier: text("risk_tier").$type<RiskTier>().notNull(),
    policyOutcome: text("policy_outcome")
      .$type<ToolPermissionSetting>()
      .notNull(),
    approvalRequestId: uuid("approval_request_id"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("tool_calls_run_idx").on(t.workflowRunId),
    uniqueIndex("tool_calls_idem_idx").on(t.idempotencyKey),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    toolCallId: uuid("tool_call_id").references(() => toolCalls.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    requestedAction: text("requested_action").notNull(),
    originalInstruction: text("original_instruction").notNull(),
    payload: jsonb("payload").notNull().default({}),
    payloadDiff: jsonb("payload_diff"),
    dataShared: jsonb("data_shared"),
    evidence: jsonb("evidence").notNull().default([]),
    riskTier: text("risk_tier").$type<RiskTier>().notNull(),
    policyReason: text("policy_reason").notNull(),
    agentRationale: text("agent_rationale"),
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    editedPayload: jsonb("edited_payload"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("approvals_ws_status_idx").on(t.workspaceId, t.status)],
);

export const artifacts = pgTable("artifacts", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workflowRunId: uuid("workflow_run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  storageRef: text("storage_ref"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Governance & metering (Spec §4.6)
// ---------------------------------------------------------------------------

// Append-only: no update/delete code path exists for this table.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorType: text("actor_type").$type<AuditActorType>().notNull(),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label").notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const usageLedgerEntries = pgTable(
  "usage_ledger_entries",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    workflowId: uuid("workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<UsageKind>().notNull(),
    quantity: integer("quantity").notNull().default(1),
    costCents: integer("cost_cents").notNull().default(0),
    provider: text("provider"),
    model: text("model"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("usage_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const budgetPolicies = pgTable("budget_policies", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").$type<"workspace" | "agent">().notNull(),
  agentId: uuid("agent_id").references(() => agents.id, {
    onDelete: "cascade",
  }),
  monthlyCapCents: integer("monthly_cap_cents").notNull(),
  warningThresholdPct: integer("warning_threshold_pct").notNull().default(80),
  hardStop: boolean("hard_stop").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const notificationSubscriptions = pgTable(
  "notification_subscriptions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").$type<"email" | "slack">().notNull(),
    eventTypes: jsonb("event_types").notNull().default([]),
    createdAt: createdAt(),
  },
);

// In-app notifications (FR-021). Slack/email delivery fans out from the same
// rows; readAt marks dismissal.
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_ws_user_idx").on(t.workspaceId, t.userId)],
);

export const metricEvents = pgTable(
  "metric_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("metric_ws_event_idx").on(t.workspaceId, t.event)],
);

// Chat conversations ride the same run pipeline; this table groups the
// per-message runs into a thread per agent+user.
export const chatThreads = pgTable("chat_threads", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "agent">().notNull(),
    content: text("content").notNull(),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_thread_idx").on(t.threadId)],
);
