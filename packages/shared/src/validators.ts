import { z } from "zod";
import {
  WORKSPACE_ROLES,
  AUTONOMY_MODES,
  TRIGGER_TYPES,
  TOOL_PERMISSION_SETTINGS,
  DELIVERY_TARGETS,
  KNOWLEDGE_SOURCE_TYPES,
  MEMORY_KINDS,
} from "./enums";

export const emailSchema = z.string().trim().toLowerCase().email();

export const signUpSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(WORKSPACE_ROLES),
});

export const updateMemberRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(WORKSPACE_ROLES),
});

export const hireAgentSchema = z.object({
  templateId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  roleTitle: z.string().trim().min(1).max(120),
  jobDescription: z.string().trim().min(1).max(8000),
  autonomyMode: z.enum(AUTONOMY_MODES).default("draft_only"),
  supervisorUserId: z.string().uuid().nullable().optional(),
  spendCapMonthlyCents: z.number().int().min(0).nullable().optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  roleTitle: z.string().trim().min(1).max(120).optional(),
  jobDescription: z.string().trim().min(1).max(8000).optional(),
  autonomyMode: z.enum(AUTONOMY_MODES).optional(),
  supervisorUserId: z.string().uuid().nullable().optional(),
  spendCapMonthlyCents: z.number().int().min(0).nullable().optional(),
  status: z.enum(["active", "paused"]).optional(),
});

export const scheduleConfigSchema = z.object({
  cron: z.string().min(9).max(100),
  timezone: z.string().min(1).max(64).default("UTC"),
});

export const triggerConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("schedule"), schedule: scheduleConfigSchema }),
  z.object({ type: z.literal("webhook") }),
  z.object({
    type: z.literal("app_event"),
    provider: z.string(),
    event: z.string(),
    filter: z.string().optional(),
  }),
]);

export const deliveryConfigSchema = z.object({
  target: z.enum(DELIVERY_TARGETS).default("run_log"),
  slackChannel: z.string().optional(),
  emailTo: z.string().optional(),
});

export const createWorkflowSchema = z.object({
  templateId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().min(1).max(20000),
  agentId: z.string().uuid(),
  trigger: triggerConfigSchema,
  delivery: deliveryConfigSchema,
  approvalPolicy: z
    .object({ requireApprovalAboveTier: z.string().optional() })
    .optional(),
});

export const updateToolPermissionSchema = z.object({
  agentId: z.string().uuid(),
  toolDefinitionId: z.string().uuid(),
  setting: z.enum(TOOL_PERMISSION_SETTINGS),
});

export const approvalDecisionSchema = z.object({
  action: z.enum(["approve", "reject", "edit", "request_revision"]),
  editedPayload: z.record(z.unknown()).optional(),
  comment: z.string().max(4000).optional(),
});

export const addKnowledgeSchema = z.object({
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(500000),
  url: z.string().url().optional(),
  agentId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const brandProfileSchema = z.object({
  tone: z.string().max(4000).default(""),
  offerings: z.string().max(8000).default(""),
  icp: z.string().max(4000).default(""),
  competitors: z.string().max(4000).default(""),
  pricingNotes: z.string().max(4000).default(""),
  escalationRules: z.string().max(4000).default(""),
  forbiddenClaims: z.string().max(4000).default(""),
  facts: z.string().max(8000).default(""),
});

export const memoryItemSchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  content: z.string().trim().min(1).max(4000),
});

export const chatMessageSchema = z.object({
  message: z.string().trim().min(1).max(20000),
});

export const runWorkflowSchema = z.object({
  mode: z.enum(["live", "simulation"]).default("live"),
});

export type TriggerConfig = z.infer<typeof triggerConfigSchema>;
export type DeliveryConfig = z.infer<typeof deliveryConfigSchema>;
