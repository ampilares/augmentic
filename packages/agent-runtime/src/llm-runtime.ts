import type { AgentPlan, EvidenceItem, ProposedToolCall } from "@augmentic/shared";
import {
  buildEvidenceBlock,
  buildSystemPrompt,
  toolListForPrompt,
} from "./prompt";
import type {
  AgentContext,
  AgentRuntime,
  DraftResult,
  EvidenceProposal,
  PlanResult,
  Usage,
} from "./types";

interface LlmConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  // Cheaper model for extraction/classification-style phases (evidence
  // proposal), protecting margin (PRD §19).
  cheapModel: string;
}

// Rough cost table (cents per 1M tokens) for the ledger; exact billing is
// reconciled elsewhere. Values err high.
const COST_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 300, out: 1500 },
  "claude-haiku-4-5-20251001": { in: 100, out: 500 },
  "gpt-4o": { in: 250, out: 1000 },
  "gpt-4o-mini": { in: 15, out: 60 },
};

function usageFor(
  cfg: LlmConfig,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Usage {
  const rate = COST_PER_MTOK[model] ?? { in: 300, out: 1500 };
  const costCents = Math.ceil(
    (inputTokens * rate.in + outputTokens * rate.out) / 1_000_000,
  );
  return { inputTokens, outputTokens, costCents, provider: cfg.provider, model };
}

// A hung provider call must fail the step (the engine's retry/park logic
// takes over) rather than pin a worker slot open-ended.
const LLM_TIMEOUT_MS = 120_000;

async function complete(
  cfg: LlmConfig,
  model: string,
  system: string,
  user: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (cfg.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };
    const text = json.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    return {
      text,
      inputTokens: json.usage.input_tokens,
      outputTokens: json.usage.output_tokens,
    };
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: json.choices[0]?.message.content ?? "",
    inputTokens: json.usage.prompt_tokens,
    outputTokens: json.usage.completion_tokens,
  };
}

function extractJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export function createLlmRuntime(cfg: LlmConfig): AgentRuntime {
  return {
    providerName: cfg.provider,

    async plan(ctx: AgentContext): Promise<PlanResult> {
      const system = buildSystemPrompt(ctx);
      const user = [
        `Task instructions:\n${ctx.workflowInstructions}`,
        ctx.triggerPayload
          ? `Trigger payload:\n${JSON.stringify(ctx.triggerPayload).slice(0, 4000)}`
          : "",
        `Available tools:\n${toolListForPrompt(ctx)}`,
        `Produce a bounded execution plan as JSON only:
{"goal": string, "steps": [{"description": string, "expectedTool": string|null}], "expectedOutputs": [string], "stepBudget": number}
Keep steps <= 6 and stepBudget <= 8. Only reference tools from the list.`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const r = await complete(cfg, cfg.model, system, user);
      const parsed = extractJson<AgentPlan>(r.text);
      const plan: AgentPlan = parsed ?? {
        goal: ctx.workflowInstructions.slice(0, 200),
        steps: [{ description: "Complete the task with available tools" }],
        expectedOutputs: ["Summary of work"],
        stepBudget: 6,
      };
      return { plan, usage: usageFor(cfg, cfg.model, r.inputTokens, r.outputTokens) };
    },

    async proposeEvidenceCalls(
      ctx: AgentContext,
      plan: AgentPlan,
      evidence: EvidenceItem[],
      round: number,
    ): Promise<EvidenceProposal> {
      const readTools = ctx.availableTools.filter((t) => t.riskTier === "read");
      if (readTools.length === 0 || round >= 3) {
        return {
          calls: [],
          done: true,
          usage: usageFor(cfg, cfg.cheapModel, 0, 0),
        };
      }
      const system = buildSystemPrompt(ctx);
      const user = [
        `Plan: ${JSON.stringify(plan)}`,
        `Evidence collected so far:\n${buildEvidenceBlock(evidence)}`,
        `Read-only tools available:\n${readTools.map((t) => `- ${t.name}: ${t.description} schema ${JSON.stringify(t.inputSchema)}`).join("\n")}`,
        `Which read-only tool calls (0-3) do you need next to gather evidence? Respond JSON only:
{"done": boolean, "calls": [{"toolName": string, "args": object, "rationale": string}]}
Set done=true when you have enough evidence.`,
      ].join("\n\n");
      const r = await complete(cfg, cfg.cheapModel, system, user);
      const parsed = extractJson<{ done: boolean; calls: ProposedToolCall[] }>(
        r.text,
      );
      return {
        calls: (parsed?.calls ?? []).slice(0, 3),
        done: parsed?.done ?? true,
        usage: usageFor(cfg, cfg.cheapModel, r.inputTokens, r.outputTokens),
      };
    },

    async draft(
      ctx: AgentContext,
      plan: AgentPlan,
      evidence: EvidenceItem[],
      revisionFeedback?: string,
    ): Promise<DraftResult> {
      const system = buildSystemPrompt(ctx);
      const actionTools = ctx.availableTools.filter((t) => t.riskTier !== "read");
      const user = [
        `Task instructions:\n${ctx.workflowInstructions}`,
        `Plan: ${JSON.stringify(plan)}`,
        `Evidence:\n${buildEvidenceBlock(evidence)}`,
        ctx.deliveryHint ? `Delivery: ${ctx.deliveryHint}` : "",
        revisionFeedback
          ? `A human reviewed your previous proposal and asked for revision: ${revisionFeedback}`
          : "",
        `Action tools you may propose (each proposal is policy-checked and may require human approval):\n${actionTools.map((t) => `- ${t.name} (${t.riskTier}): ${t.description} schema ${JSON.stringify(t.inputSchema)}`).join("\n")}`,
        `Produce your work as JSON only:
{"output": string (the deliverable: digest, brief, draft text, report — markdown), "proposedActions": [{"toolName": string, "args": object, "rationale": string}]}
Only propose actions genuinely required by the instructions. Cite evidence items like [Evidence 2] inside the output where used.`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const r = await complete(cfg, cfg.model, system, user);
      const parsed = extractJson<{
        output: string;
        proposedActions: ProposedToolCall[];
      }>(r.text);
      return {
        output: parsed?.output ?? r.text,
        proposedActions: parsed?.proposedActions ?? [],
        usage: usageFor(cfg, cfg.model, r.inputTokens, r.outputTokens),
      };
    },
  };
}
