import {
  agentRuns,
  agents,
  approvalRequests,
  artifacts,
  brandProfiles,
  chatMessages,
  integrationConnections,
  knowledgeItems,
  memoryItems,
  runSteps,
  secretRefs,
  toolCalls,
  toolDefinitions,
  toolPermissionPolicies,
  workflowRuns,
  workflows,
  type Db,
} from "@augmentic/db";
import {
  TOOL_CATALOG,
  TOOL_CATALOG_BY_NAME,
  type EvidenceItem,
  type ProposedToolCall,
  type RiskTier,
  type RunMode,
  type RunStepType,
  type ToolPermissionSetting,
} from "@augmentic/shared";
import { classifyToolCall, sanitizeUntrusted, validateToolArgs } from "@augmentic/policy";
import {
  createAgentRuntime,
  type AgentContext,
  type Usage,
} from "@augmentic/agent-runtime";
import {
  executeTool,
  type ConnectionInfo,
  type ToolExecutionContext,
} from "@augmentic/connectors";
import { and, eq, inArray } from "drizzle-orm";
import { recordActivationMetric, recordAudit, recordUsage } from "./audit";
import { checkAgentBudget } from "./budget";
import { decryptSecret } from "./secrets";

// ---------------------------------------------------------------------------
// Durable resume state persisted on workflow_runs.resume_state. Everything
// needed to continue after a worker restart or a days-later approval lives
// here — never in process memory (FR-016).
// ---------------------------------------------------------------------------

interface ActionState {
  call: ProposedToolCall;
  status: "pending" | "approved" | "rejected" | "executed" | "denied" | "failed";
  approvalRequestId?: string;
  toolCallId?: string;
  result?: unknown;
}

export interface ResumeState {
  phase: "start" | "actions" | "redraft" | "finish";
  plan?: unknown;
  evidence?: EvidenceItem[];
  output?: string;
  actions?: ActionState[];
  actionIndex?: number;
  revisionFeedback?: string;
  stepSeq?: number;
  agentRunId?: string;
}

interface RunRow {
  id: string;
  workspaceId: string;
  workflowId: string | null;
  agentId: string;
  mode: RunMode;
  triggerType: string;
  triggerSnapshot: Record<string, unknown>;
  resumeState: ResumeState | null;
  costCents: number;
}

export class RunParkedError extends Error {
  constructor() {
    super("run parked for approval");
    this.name = "RunParkedError";
  }
}

export class RunBlockedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "RunBlockedError";
  }
}

// ---------------------------------------------------------------------------

export async function processRun(db: Db, runId: string): Promise<void> {
  const [runRow] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId));
  if (!runRow) throw new Error(`run ${runId} not found`);
  const run: RunRow = {
    id: runRow.id,
    workspaceId: runRow.workspaceId,
    workflowId: runRow.workflowId,
    agentId: runRow.agentId,
    mode: runRow.mode,
    triggerType: runRow.triggerType,
    triggerSnapshot: (runRow.triggerSnapshot ?? {}) as Record<string, unknown>,
    resumeState: (runRow.resumeState as ResumeState | null) ?? null,
    costCents: runRow.costCents,
  };

  try {
    await executePipeline(db, run);
  } catch (err) {
    if (err instanceof RunParkedError) return; // parked in waiting_approval
    if (err instanceof RunBlockedError) {
      await db
        .update(workflowRuns)
        .set({
          status: "blocked",
          statusReason: err.reason,
          finishedAt: new Date(),
          lockedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, run.id));
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(workflowRuns)
      .set({
        status: "failed",
        statusReason: message.slice(0, 500),
        finishedAt: new Date(),
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id));
    await recordAudit(db, {
      workspaceId: run.workspaceId,
      actorType: "system",
      actorLabel: "engine",
      eventType: "run.failed",
      entityType: "workflow_run",
      entityId: run.id,
      payload: { error: message.slice(0, 500) },
    });
  }
}

async function executePipeline(db: Db, run: RunRow): Promise<void> {
  const state: ResumeState = run.resumeState ?? { phase: "start", stepSeq: 0 };

  const step = async <T>(
    stepType: RunStepType,
    title: string,
    input: unknown,
    fn: () => Promise<T>,
  ): Promise<T> => {
    const seq = (state.stepSeq = (state.stepSeq ?? 0) + 1);
    const started = Date.now();
    const [row] = await db
      .insert(runSteps)
      .values({
        workspaceId: run.workspaceId,
        workflowRunId: run.id,
        agentRunId: state.agentRunId ?? null,
        seq,
        stepType,
        status: "running",
        title,
        input: input ?? null,
      })
      .returning({ id: runSteps.id });
    try {
      const output = await fn();
      await db
        .update(runSteps)
        .set({
          status: "succeeded",
          output: (output ?? null) as never,
          durationMs: Date.now() - started,
          updatedAt: new Date(),
        })
        .where(eq(runSteps.id, row!.id));
      return output;
    } catch (err) {
      const isPark = err instanceof RunParkedError;
      await db
        .update(runSteps)
        .set({
          status: isPark ? "waiting" : "failed",
          error: isPark ? null : String(err instanceof Error ? err.message : err).slice(0, 1000),
          durationMs: Date.now() - started,
          updatedAt: new Date(),
        })
        .where(eq(runSteps.id, row!.id));
      throw err;
    }
  };

  const saveState = async (
    status: "running" | "waiting_approval",
    extra: Partial<ResumeState> = {},
  ) => {
    Object.assign(state, extra);
    await db
      .update(workflowRuns)
      .set({
        resumeState: state as never,
        status,
        ...(status === "waiting_approval" ? { lockedBy: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id));
  };

  const addCost = async (usage: Usage) => {
    if (usage.costCents > 0 || usage.inputTokens > 0) {
      await recordUsage(db, {
        workspaceId: run.workspaceId,
        agentId: run.agentId,
        workflowId: run.workflowId,
        workflowRunId: run.id,
        kind: "model_tokens",
        quantity: usage.inputTokens + usage.outputTokens,
        costCents: usage.costCents,
        provider: usage.provider,
        model: usage.model,
      });
      run.costCents += usage.costCents;
      await db
        .update(workflowRuns)
        .set({ costCents: run.costCents, updatedAt: new Date() })
        .where(eq(workflowRuns.id, run.id));
    }
  };

  // Load the world -----------------------------------------------------------
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, run.agentId), eq(agents.workspaceId, run.workspaceId)));
  if (!agent) throw new RunBlockedError("Agent not found");

  const workflow = run.workflowId
    ? (
        await db
          .select()
          .from(workflows)
          .where(
            and(
              eq(workflows.id, run.workflowId),
              eq(workflows.workspaceId, run.workspaceId),
            ),
          )
      )[0]
    : null;

  const instructions =
    workflow?.instructions ??
    String(run.triggerSnapshot["instructions"] ?? "Complete the requested task.");

  const connections = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.workspaceId, run.workspaceId));

  const connectionByProvider = new Map(connections.map((c) => [c.provider, c]));
  // Google is one connection covering gmail/gcal/gdrive sub-providers.
  const resolveConnection = (toolProvider: string) => {
    if (["gmail", "gcal", "gdrive"].includes(toolProvider)) {
      return connectionByProvider.get("google") ?? null;
    }
    return connectionByProvider.get(toolProvider) ?? null;
  };

  const permRows = await db
    .select()
    .from(toolPermissionPolicies)
    .where(
      and(
        eq(toolPermissionPolicies.workspaceId, run.workspaceId),
        eq(toolPermissionPolicies.agentId, run.agentId),
      ),
    );
  const toolDefRows = await db.select().from(toolDefinitions);
  const toolDefByName = new Map(toolDefRows.map((t) => [t.name, t]));
  const permByToolDefId = new Map(permRows.map((p) => [p.toolDefinitionId, p.setting]));
  const permForTool = (toolName: string): ToolPermissionSetting | undefined => {
    const def = toolDefByName.get(toolName);
    return def ? permByToolDefId.get(def.id) : undefined;
  };

  // Tools visible to the agent: connected providers + internal, minus denied.
  const availableTools = TOOL_CATALOG.filter((t) => {
    if (t.provider === "internal") return true;
    if (t.provider === "webhook") return false; // delivery-only in MVP
    if (!resolveConnection(t.provider)) return false;
    return permForTool(t.name) !== "deny";
  });

  const brand = (
    await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, run.workspaceId))
  )[0];

  const memories = await db
    .select({ content: memoryItems.content })
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.workspaceId, run.workspaceId),
        eq(memoryItems.agentId, run.agentId),
      ),
    );

  const delivery = (workflow?.deliveryConfig ?? { target: "run_log" }) as {
    target?: string;
    slackChannel?: string;
    emailTo?: string;
  };

  const ctx: AgentContext = {
    agent: {
      name: agent.name,
      roleTitle: agent.roleTitle,
      jobDescription: agent.jobDescription,
      autonomyMode: agent.autonomyMode,
    },
    brand: brand
      ? {
          tone: brand.tone,
          offerings: brand.offerings,
          icp: brand.icp,
          forbiddenClaims: brand.forbiddenClaims,
          escalationRules: brand.escalationRules,
          facts: brand.facts,
        }
      : null,
    memories: memories.map((m) => m.content),
    skills: [],
    workflowInstructions: instructions,
    deliveryHint:
      delivery.target === "slack_channel"
        ? `Deliver the result to Slack channel ${delivery.slackChannel ?? "#general"}`
        : delivery.target === "email_draft"
          ? `Deliver the result as an email draft to ${delivery.emailTo ?? "the owner"}`
          : "Deliver the result to the run log",
    triggerPayload: run.triggerSnapshot["payload"],
    availableTools,
  };

  const runtime = createAgentRuntime();

  // Executes one classified tool call with idempotency (Spec §5 step 8).
  const runToolCall = async (
    call: ProposedToolCall,
    policyOutcome: ToolPermissionSetting,
    riskTier: RiskTier,
    idempotencyKey: string,
    approvalRequestId?: string,
  ): Promise<{ result: unknown; toolCallId: string }> => {
    // Idempotency: a retried step must never duplicate an external action.
    const existing = await db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.idempotencyKey, idempotencyKey));
    if (existing.length > 0 && existing[0]!.executedAt) {
      return { result: existing[0]!.result, toolCallId: existing[0]!.id };
    }

    const def = toolDefByName.get(call.toolName);
    const spec = TOOL_CATALOG_BY_NAME[call.toolName];
    if (!spec) throw new Error(`Unknown tool ${call.toolName}`);
    const conn = resolveConnection(spec.provider);
    let connectionInfo: ConnectionInfo | null = null;
    if (conn) {
      let accessToken: string | undefined;
      if (!conn.isDemo && conn.secretRefId) {
        const [secret] = await db
          .select()
          .from(secretRefs)
          .where(eq(secretRefs.id, conn.secretRefId));
        if (secret) {
          const parsed = JSON.parse(decryptSecret(secret.ciphertext)) as {
            accessToken?: string;
          };
          accessToken = parsed.accessToken;
        }
      }
      connectionInfo = {
        id: conn.id,
        provider: conn.provider,
        isDemo: conn.isDemo,
        accountLabel: conn.accountLabel,
        accessToken,
      };
    }

    const execCtx: ToolExecutionContext = {
      workspaceId: run.workspaceId,
      connection: connectionInfo,
      mode: run.mode,
      idempotencyKey,
    };

    const [tcRow] =
      existing.length > 0
        ? [existing[0]!]
        : await db
            .insert(toolCalls)
            .values({
              workspaceId: run.workspaceId,
              workflowRunId: run.id,
              toolDefinitionId: def?.id ?? null,
              toolName: call.toolName,
              connectionId: conn?.id ?? null,
              args: call.args,
              idempotencyKey,
              riskTier,
              policyOutcome,
              approvalRequestId: approvalRequestId ?? null,
            })
            .returning();

    // knowledge.search is served by the engine from the workspace KB.
    let result: unknown;
    if (call.toolName === "knowledge.search") {
      result = await searchKnowledge(db, run.workspaceId, String(call.args.query ?? ""), Number(call.args.limit ?? 5));
    } else {
      result = await executeTool(call.toolName, call.args, execCtx);
    }

    await db
      .update(toolCalls)
      .set({ result: result as never, executedAt: new Date() })
      .where(eq(toolCalls.id, tcRow!.id));

    await recordUsage(db, {
      workspaceId: run.workspaceId,
      agentId: run.agentId,
      workflowId: run.workflowId,
      workflowRunId: run.id,
      kind: "tool_call",
      metadata: { tool: call.toolName },
    });

    if (["external_send", "publish", "internal_write", "delete"].includes(riskTier)) {
      await recordAudit(db, {
        workspaceId: run.workspaceId,
        actorType: "agent",
        actorId: run.agentId,
        actorLabel: agent.name,
        eventType: "tool.external_write",
        entityType: "tool_call",
        entityId: tcRow!.id,
        payload: { tool: call.toolName, args: call.args, dataShared: call.args },
      });
    }

    return { result, toolCallId: tcRow!.id };
  };

  // -------------------------------------------------------------------------
  // Phase: start — steps 1-5 of the lifecycle.
  // -------------------------------------------------------------------------
  if (state.phase === "start") {
    await step("trigger", `Triggered (${run.triggerType})`, run.triggerSnapshot, async () => ({
      triggerType: run.triggerType,
      mode: run.mode,
    }));

    await step("preflight", "Preflight checks", null, async () => {
      if (agent.status === "blocked" || agent.status === "error") {
        throw new RunBlockedError(`Agent status is ${agent.status}.`);
      }
      if (run.mode === "live" && agent.status === "paused") {
        throw new RunBlockedError("Agent is paused.");
      }
      const budget = await checkAgentBudget(db, run.workspaceId, run.agentId);
      if (!budget.ok) {
        if (budget.hardStopped) {
          await db
            .update(agents)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(agents.id, run.agentId));
          await recordAudit(db, {
            workspaceId: run.workspaceId,
            actorType: "system",
            actorLabel: "engine",
            eventType: "agent.budget_hard_stop",
            entityType: "agent",
            entityId: run.agentId,
            payload: { spentCents: budget.spentCents, capCents: budget.capCents },
          });
        }
        throw new RunBlockedError(budget.reason ?? "Budget check failed.");
      }
      const missing = (workflow?.templateId ? [] : []) as string[];
      const health = connections.map((c) => ({
        provider: c.provider,
        health: c.healthStatus,
        demo: c.isDemo,
      }));
      return { budget, connections: health, missingDependencies: missing };
    });

    const planResult = await step("plan", "Agent plan", { instructions }, async () => {
      const r = await runtime.plan(ctx);
      await addCost(r.usage);
      return r.plan;
    });

    const [agentRunRow] = await db
      .insert(agentRuns)
      .values({
        workspaceId: run.workspaceId,
        workflowRunId: run.id,
        agentId: run.agentId,
        plan: planResult as never,
        status: "running",
      })
      .returning({ id: agentRuns.id });
    state.agentRunId = agentRunRow!.id;
    state.plan = planResult;

    // Evidence loop: read-tier tools only; all results labeled untrusted.
    const evidence: EvidenceItem[] = [];
    let round = 0;
    let done = false;
    while (!done && round < 3) {
      const proposal = await runtime.proposeEvidenceCalls(
        ctx,
        planResult as never,
        evidence,
        round,
      );
      await addCost(proposal.usage);
      done = proposal.done;
      if (proposal.calls.length === 0) break;
      await step(
        "evidence",
        `Retrieve evidence (round ${round + 1})`,
        { calls: proposal.calls.map((c) => c.toolName) },
        async () => {
          for (const call of proposal.calls) {
            const spec = TOOL_CATALOG_BY_NAME[call.toolName];
            if (!spec || spec.riskTier !== "read") continue; // evidence loop may only read
            const validation = validateToolArgs(spec.inputSchema, call.args);
            if (!validation.ok) continue;
            const decision = classifyToolCall({
              toolName: call.toolName,
              riskTier: spec.riskTier,
              autonomyMode: agent.autonomyMode,
              agentPermission: permForTool(call.toolName),
              mode: run.mode,
            });
            if (decision.outcome !== "allow") continue;
            const key = `${run.id}:evidence:${round}:${call.toolName}:${JSON.stringify(call.args).slice(0, 60)}`;
            try {
              const { result } = await runToolCall(call, "allow", spec.riskTier, key);
              evidence.push({
                source: call.toolName,
                title: `${call.toolName}(${JSON.stringify(call.args).slice(0, 80)})`,
                content: sanitizeUntrusted(JSON.stringify(result).slice(0, 6000)),
                untrusted: true,
              });
            } catch (err) {
              evidence.push({
                source: call.toolName,
                title: `${call.toolName} failed`,
                content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
                untrusted: false,
              });
            }
          }
          return { collected: evidence.length };
        },
      );
      round += 1;
    }
    state.evidence = evidence;
    await saveState("running", { phase: "redraft" });
  }

  // -------------------------------------------------------------------------
  // Phase: redraft — step 5 (draft/propose). Entered fresh or on revision.
  // -------------------------------------------------------------------------
  if (state.phase === "redraft") {
    const draft = await step(
      "draft",
      state.revisionFeedback ? "Revise draft (human feedback)" : "Draft output & propose actions",
      { revisionFeedback: state.revisionFeedback ?? null },
      async () => {
        const r = await runtime.draft(
          ctx,
          state.plan as never,
          state.evidence ?? [],
          state.revisionFeedback,
        );
        await addCost(r.usage);
        return r;
      },
    );
    state.output = draft.output;
    state.actions = draft.proposedActions.map((call) => ({ call, status: "pending" }));
    state.actionIndex = 0;
    state.revisionFeedback = undefined;
    await saveState("running", { phase: "actions" });
  }

  // -------------------------------------------------------------------------
  // Phase: actions — steps 6-8 per proposed action, with approval parking.
  // -------------------------------------------------------------------------
  if (state.phase === "actions") {
    const actions = state.actions ?? [];
    for (let i = state.actionIndex ?? 0; i < actions.length; i++) {
      state.actionIndex = i;
      const action = actions[i]!;
      if (["executed", "rejected", "denied", "failed"].includes(action.status)) continue;

      const spec = TOOL_CATALOG_BY_NAME[action.call.toolName];
      if (!spec) {
        action.status = "denied";
        continue;
      }

      // Server-side validation of model-produced args (Spec §7.2).
      const validation = validateToolArgs(spec.inputSchema, action.call.args);
      if (!validation.ok) {
        await step("risk_classify", `Rejected malformed args: ${action.call.toolName}`, action.call, async () => ({
          errors: validation.errors,
        }));
        action.status = "failed";
        continue;
      }

      if (action.status === "approved") {
        // Resuming after human approval: execute with the (possibly edited)
        // approved payload.
        const approval = action.approvalRequestId
          ? (
              await db
                .select()
                .from(approvalRequests)
                .where(eq(approvalRequests.id, action.approvalRequestId))
            )[0]
          : null;
        const payload = (approval?.editedPayload ?? action.call.args) as Record<string, unknown>;
        const finalCall = { ...action.call, args: payload };
        const key = `${run.id}:action:${i}:${action.call.toolName}`;
        const execResult = await step(
          "execute",
          `Execute approved: ${action.call.toolName}`,
          { args: payload },
          async () => {
            const r = await runToolCall(
              finalCall,
              "require_approval",
              spec.riskTier,
              key,
              action.approvalRequestId,
            );
            return r.result;
          },
        );
        action.result = execResult;
        action.status = "executed";
        await saveState("running");
        continue;
      }

      const decision = await step(
        "risk_classify",
        `Classify: ${action.call.toolName}`,
        action.call,
        async () =>
          classifyToolCall({
            toolName: action.call.toolName,
            riskTier: spec.riskTier,
            autonomyMode: agent.autonomyMode,
            agentPermission: permForTool(action.call.toolName),
            mode: run.mode,
          }),
      );

      if (decision.outcome === "deny") {
        action.status = "denied";
        await recordAudit(db, {
          workspaceId: run.workspaceId,
          actorType: "system",
          actorLabel: "policy-engine",
          eventType: "tool.denied",
          entityType: "workflow_run",
          entityId: run.id,
          payload: { tool: action.call.toolName, reason: decision.reason },
        });
        await saveState("running");
        continue;
      }

      if (decision.outcome === "require_approval") {
        if (run.mode === "simulation") {
          // Simulation reports what would happen; nothing executes, nothing parks.
          await step("approval", `Would request approval: ${action.call.toolName}`, action.call, async () => ({
            simulated: true,
            reason: decision.reason,
          }));
          action.status = "denied"; // recorded as not-executed in simulation
          await saveState("running");
          continue;
        }
        const [approval] = await db
          .insert(approvalRequests)
          .values({
            workspaceId: run.workspaceId,
            workflowRunId: run.id,
            agentId: run.agentId,
            requestedAction: `${action.call.toolName}`,
            originalInstruction: instructions.slice(0, 2000),
            payload: action.call.args,
            dataShared: action.call.args,
            evidence: (state.evidence ?? []).map((e) => ({
              source: e.source,
              title: e.title,
              excerpt: e.content.slice(0, 300),
            })) as never,
            riskTier: decision.riskTier,
            policyReason: decision.reason,
            agentRationale: action.call.rationale,
            status: "pending",
          })
          .returning({ id: approvalRequests.id });
        action.approvalRequestId = approval!.id;

        await step("approval", `Approval requested: ${action.call.toolName}`, {
          approvalRequestId: approval!.id,
          payload: action.call.args,
          reason: decision.reason,
        }, async () => {
          throw new RunParkedError();
        }).catch(async (err) => {
          if (err instanceof RunParkedError) {
            await recordAudit(db, {
              workspaceId: run.workspaceId,
              actorType: "agent",
              actorId: run.agentId,
              actorLabel: agent.name,
              eventType: "approval.requested",
              entityType: "approval_request",
              entityId: approval!.id,
              payload: { tool: action.call.toolName, riskTier: decision.riskTier },
            });
            await saveState("waiting_approval");
          }
          throw err;
        });
      }

      // Allowed: execute immediately.
      const key = `${run.id}:action:${i}:${action.call.toolName}`;
      const execResult = await step(
        "execute",
        `Execute: ${action.call.toolName}`,
        { args: action.call.args },
        async () => {
          const r = await runToolCall(action.call, "allow", spec.riskTier, key);
          return r.result;
        },
      );
      action.result = execResult;
      action.status = "executed";
      await saveState("running");
    }
    state.phase = "finish";
    await saveState("running");
  }

  // -------------------------------------------------------------------------
  // Phase: finish — steps 9-11 (verify, deliver, ledger).
  // -------------------------------------------------------------------------
  if (state.phase === "finish") {
    await step("verify", "Verify output & create artifact", null, async () => {
      const output = state.output ?? "";
      if (output.trim().length === 0) throw new Error("Empty output produced");
      await db.insert(artifacts).values({
        workspaceId: run.workspaceId,
        workflowRunId: run.id,
        kind: run.mode === "chat" ? "chat_reply" : "report",
        title: workflow?.name ?? "Ad-hoc task output",
        content: output,
        metadata: {
          actions: (state.actions ?? []).map((a) => ({
            tool: a.call.toolName,
            status: a.status,
          })),
        },
      });
      return { artifactCreated: true, outputChars: output.length };
    });

    await step("deliver", `Deliver (${delivery.target ?? "run_log"})`, delivery, async () => {
      if (run.mode === "chat") {
        const threadId = run.triggerSnapshot["chatThreadId"];
        if (typeof threadId === "string") {
          await db.insert(chatMessages).values({
            workspaceId: run.workspaceId,
            threadId,
            role: "agent",
            content: state.output ?? "",
            workflowRunId: run.id,
          });
        }
        return { delivered: "chat" };
      }
      if (run.mode !== "live") return { delivered: "run_log", note: `${run.mode} mode` };
      if (delivery.target === "slack_channel" && delivery.slackChannel) {
        // Delivery destination was configured by a human at workflow setup —
        // that consent is the deterministic policy basis. Only ≤internal_write
        // targets are supported here by construction.
        const call: ProposedToolCall = {
          toolName: "slack.post_message",
          args: { channel: delivery.slackChannel, text: (state.output ?? "").slice(0, 3500) },
          rationale: "Workflow delivery target",
        };
        const key = `${run.id}:deliver:slack`;
        const r = await runToolCall(call, "allow", "internal_write", key);
        return { delivered: "slack_channel", result: r.result };
      }
      if (delivery.target === "email_draft" && delivery.emailTo) {
        const call: ProposedToolCall = {
          toolName: "gmail.create_draft",
          args: {
            to: delivery.emailTo,
            subject: workflow?.name ?? "Augmentic output",
            body: (state.output ?? "").slice(0, 8000),
          },
          rationale: "Workflow delivery target",
        };
        const key = `${run.id}:deliver:email`;
        const r = await runToolCall(call, "allow", "draft", key);
        return { delivered: "email_draft", result: r.result };
      }
      return { delivered: "run_log" };
    });

    await step("ledger", "Ledger & audit", null, async () => {
      await recordUsage(db, {
        workspaceId: run.workspaceId,
        agentId: run.agentId,
        workflowId: run.workflowId,
        workflowRunId: run.id,
        kind: "run",
        costCents: 0,
      });
      await recordAudit(db, {
        workspaceId: run.workspaceId,
        actorType: "system",
        actorLabel: "engine",
        eventType: run.mode === "simulation" ? "run.simulated" : "run.completed",
        entityType: "workflow_run",
        entityId: run.id,
        payload: { costCents: run.costCents, workflowId: run.workflowId },
      });
      if (run.mode === "simulation") {
        await recordActivationMetric(db, run.workspaceId, "first_workflow_simulated");
      } else {
        await recordActivationMetric(db, run.workspaceId, "first_workflow_run_completed");
      }
      return { costCents: run.costCents };
    });

    if (state.agentRunId) {
      await db
        .update(agentRuns)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(eq(agentRuns.id, state.agentRunId));
    }
    await db
      .update(workflowRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        resumeState: state as never,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id));
  }
}

async function searchKnowledge(
  db: Db,
  workspaceId: string,
  query: string,
  limit: number,
): Promise<{ results: { id: string; title: string; excerpt: string }[] }> {
  const items = await db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.workspaceId, workspaceId));
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const scored = items
    .map((item) => {
      const hay = `${item.title} ${item.content}`.toLowerCase();
      const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((s) => s.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit || 5, 10));
  return {
    results: scored.map(({ item }) => ({
      id: item.id,
      title: item.title,
      excerpt: item.content.slice(0, 500),
    })),
  };
}
