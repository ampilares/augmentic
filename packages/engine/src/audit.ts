import { auditEvents, metricEvents, usageLedgerEntries, type Db } from "@augmentic/db";
import { and, eq } from "drizzle-orm";
import type { AuditActorType, UsageKind } from "@augmentic/shared";

export interface AuditInput {
  workspaceId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  actorLabel: string;
  eventType: string;
  entityType?: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  ip?: string;
}

// The single append path for audit events. There is intentionally no update
// or delete helper anywhere in the codebase (FR-018).
export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    workspaceId: input.workspaceId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    payload: input.payload ?? {},
    ip: input.ip,
  });
}

export interface UsageInput {
  workspaceId: string;
  agentId?: string | null;
  workflowId?: string | null;
  workflowRunId?: string | null;
  kind: UsageKind;
  quantity?: number;
  costCents?: number;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export async function recordUsage(db: Db, input: UsageInput): Promise<void> {
  await db.insert(usageLedgerEntries).values({
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? null,
    workflowId: input.workflowId ?? null,
    workflowRunId: input.workflowRunId ?? null,
    kind: input.kind,
    quantity: input.quantity ?? 1,
    costCents: input.costCents ?? 0,
    provider: input.provider,
    model: input.model,
    metadata: input.metadata ?? {},
  });
}

// Emits first-time activation metrics (Spec §14) exactly once per workspace.
export async function recordActivationMetric(
  db: Db,
  workspaceId: string,
  event: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const existing = await db
    .select({ id: metricEvents.id })
    .from(metricEvents)
    .where(and(eq(metricEvents.workspaceId, workspaceId), eq(metricEvents.event, event)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(metricEvents).values({ workspaceId, event, metadata });
  }
}
