import type {
  AgentPlan,
  EvidenceItem,
  ProposedToolCall,
} from "@augmentic/shared";
import type {
  AgentContext,
  AgentRuntime,
  DraftResult,
  EvidenceProposal,
  PlanResult,
  Usage,
} from "./types";

// Deterministic no-API-key runtime. It reads only the trusted workflow
// instructions (never evidence content) to decide behavior, produces a
// legible digest of whatever evidence the tools returned, and proposes
// side-effect actions when the instructions call for them. This keeps the
// full product loop — including approvals — demonstrable offline.

const usage: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  costCents: 0,
  provider: "simulated",
  model: "deterministic-v1",
};

function has(instructions: string, ...words: string[]): boolean {
  const lower = instructions.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function pickReadCalls(ctx: AgentContext): ProposedToolCall[] {
  const ins = `${ctx.workflowInstructions} ${ctx.deliveryHint ?? ""}`;
  const available = new Set(ctx.availableTools.map((t) => t.name));
  const calls: ProposedToolCall[] = [];
  if (
    available.has("gmail.search_messages") &&
    has(ins, "inbox", "email", "mail", "invoice", "lead", "deal", "receipt", "thread", "support")
  ) {
    const query = has(ins, "invoice", "receipt", "overdue")
      ? "invoice"
      : has(ins, "deal", "lead", "stalled")
        ? "newer_than:7d"
        : "newer_than:1d";
    calls.push({
      toolName: "gmail.search_messages",
      args: { query, maxResults: 15 },
      rationale: "Collect relevant messages for the task window.",
    });
  }
  if (
    available.has("gcal.list_events") &&
    has(ins, "calendar", "meeting", "event", "schedule a", "prep")
  ) {
    const from = new Date();
    const to = new Date(Date.now() + 3 * 86_400_000);
    calls.push({
      toolName: "gcal.list_events",
      args: { from: from.toISOString(), to: to.toISOString() },
      rationale: "Review upcoming events.",
    });
  }
  if (
    available.has("slack.read_channel") &&
    has(ins, "slack", "channel", "team update", "status")
  ) {
    calls.push({
      toolName: "slack.read_channel",
      args: { channel: "", limit: 20 },
      rationale: "Review recent team activity.",
    });
  }
  if (
    available.has("gdrive.search_files") &&
    has(ins, "doc", "file", "drive", "invoice", "tracker", "record")
  ) {
    calls.push({
      toolName: "gdrive.search_files",
      args: { query: has(ins, "invoice") ? "invoice" : "" },
      rationale: "Locate relevant documents.",
    });
  }
  if (
    available.has("xero.list_invoices") &&
    has(ins, "invoice", "overdue", "payment", "cash", "receivable")
  ) {
    calls.push({
      toolName: "xero.list_invoices",
      args: has(ins, "overdue", "chase", "reminder")
        ? { status: "OVERDUE", limit: 20 }
        : { limit: 20 },
      rationale: "Pull invoice records from Xero.",
    });
  }
  if (
    available.has("monday.list_boards") &&
    has(ins, "pipeline", "deal", "lead", "crm", "board", "monday")
  ) {
    calls.push({
      toolName: "monday.list_boards",
      args: {},
      rationale: "Find relevant monday.com boards.",
    });
  }
  if (available.has("knowledge.search")) {
    calls.push({
      toolName: "knowledge.search",
      args: { query: ctx.workflowInstructions.slice(0, 80), limit: 3 },
      rationale: "Check workspace knowledge for relevant SOPs and facts.",
    });
  }
  return calls.slice(0, 4);
}

function summarizeEvidence(evidence: EvidenceItem[]): string {
  if (evidence.length === 0) return "_No evidence was available._";
  return evidence
    .map((e, i) => {
      const oneLine = e.content.replace(/\s+/g, " ").slice(0, 220);
      return `- **${e.title}** — ${oneLine}${e.content.length > 220 ? "…" : ""} _[Evidence ${i + 1}]_`;
    })
    .join("\n");
}

function proposeActions(
  ctx: AgentContext,
  evidence: EvidenceItem[],
): ProposedToolCall[] {
  const ins = `${ctx.workflowInstructions} ${ctx.deliveryHint ?? ""}`;
  const available = new Set(ctx.availableTools.map((t) => t.name));
  const actions: ProposedToolCall[] = [];

  if (
    available.has("slack.post_message") &&
    (has(ins, "slack", "#") || has(ins, "post the digest", "post the summary"))
  ) {
    actions.push({
      toolName: "slack.post_message",
      args: {
        channel: extractChannel(ins) ?? "#reports",
        text: `Update from ${ctx.agent.name}: work summary ready — see run log for the full report.`,
      },
      rationale: "Instructions ask for delivery to a Slack channel.",
    });
  }

  if (
    available.has("gmail.create_draft") &&
    has(ins, "draft", "reminder", "follow-up", "follow up", "chase", "nudge", "request")
  ) {
    const target = firstExternalSender(evidence) ?? "recipient@example.com";
    actions.push({
      toolName: "gmail.create_draft",
      args: {
        to: target,
        subject: has(ins, "invoice")
          ? "Friendly reminder: outstanding invoice"
          : "Following up",
        body: `Hi,\n\nFollowing up per our records. (Drafted by ${ctx.agent.name} for human review.)\n\nBest,\n${ctx.agent.name}`,
      },
      rationale: "Instructions ask for a reviewable draft.",
    });
  }

  if (
    available.has("gmail.send_email") &&
    has(ins, "send the reminder", "send reminder", "send a reminder", "send the email", "and send")
  ) {
    const target = firstExternalSender(evidence) ?? "recipient@example.com";
    actions.push({
      toolName: "gmail.send_email",
      args: {
        to: target,
        subject: "Reminder: outstanding item",
        body: `Hi,\n\nA quick reminder per our records.\n\nBest,\n${ctx.agent.name}`,
      },
      rationale: "Instructions explicitly ask to send; requires approval.",
    });
  }

  return actions;
}

function extractChannel(text: string): string | null {
  const m = text.match(/#[a-z0-9_-]+/i);
  return m ? m[0] : null;
}

function firstExternalSender(evidence: EvidenceItem[]): string | null {
  for (const e of evidence) {
    const m = e.content.match(/[a-z0-9._%+-]+@(?!beaconstudio)[a-z0-9.-]+\.[a-z]{2,}/i);
    if (m) return m[0];
  }
  return null;
}

export function createSimulatedRuntime(): AgentRuntime {
  return {
    providerName: "simulated",

    async plan(ctx: AgentContext): Promise<PlanResult> {
      const reads = pickReadCalls(ctx);
      const plan: AgentPlan = {
        goal: ctx.workflowInstructions.split(/[.\n]/)[0]?.trim() ?? "Complete the task",
        steps: [
          ...reads.map((c) => ({
            description: c.rationale ?? `Call ${c.toolName}`,
            expectedTool: c.toolName,
          })),
          { description: "Compose the deliverable from collected evidence" },
          { description: "Deliver output and propose any follow-up actions" },
        ],
        expectedOutputs: ["Markdown report/draft with citations"],
        stepBudget: reads.length + 3,
      };
      return { plan, usage };
    },

    async proposeEvidenceCalls(
      ctx: AgentContext,
      _plan: AgentPlan,
      evidence: EvidenceItem[],
      round: number,
    ): Promise<EvidenceProposal> {
      if (round === 0) {
        const calls = pickReadCalls(ctx);
        // If we asked for monday boards, we need a second round to read items.
        const needsFollowUp = calls.some((c) => c.toolName === "monday.list_boards");
        return { calls, done: !needsFollowUp, usage };
      }
      if (round === 1) {
        // Follow up: read items from the first board found.
        const boardsEvidence = evidence.find((e) => e.source === "monday.list_boards");
        const boardId = boardsEvidence?.content.match(/"id":\s*"([^"]+)"/)?.[1];
        if (boardId) {
          return {
            calls: [
              {
                toolName: "monday.get_items",
                args: { boardId, limit: 25 },
                rationale: "Read items from the most relevant board.",
              },
            ],
            done: true,
            usage,
          };
        }
      }
      return { calls: [], done: true, usage };
    },

    async draft(
      ctx: AgentContext,
      plan: AgentPlan,
      evidence: EvidenceItem[],
      revisionFeedback?: string,
    ): Promise<DraftResult> {
      const lines: string[] = [
        `## ${plan.goal}`,
        "",
        `_Prepared by ${ctx.agent.name} (${ctx.agent.roleTitle})_`,
        "",
        "### What I found",
        summarizeEvidence(evidence),
      ];
      if (revisionFeedback) {
        lines.push("", `### Revision applied`, `Reviewer feedback: ${revisionFeedback}`);
      }
      const actions = proposeActions(ctx, evidence);
      if (actions.length > 0) {
        lines.push(
          "",
          "### Proposed actions",
          ...actions.map(
            (a) => `- \`${a.toolName}\` → ${JSON.stringify(a.args).slice(0, 160)}`,
          ),
        );
      }
      return { output: lines.join("\n"), proposedActions: actions, usage };
    },
  };
}
