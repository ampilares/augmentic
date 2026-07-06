import { createLlmRuntime } from "./llm-runtime";
import { createSimulatedRuntime } from "./simulated-runtime";
import type { AgentRuntime } from "./types";

export * from "./types";
export { buildSystemPrompt, buildEvidenceBlock } from "./prompt";
export { createSimulatedRuntime } from "./simulated-runtime";
export { createLlmRuntime } from "./llm-runtime";

// Provider is configuration, not architecture (Spec §6). Anthropic preferred,
// OpenAI supported, deterministic simulated runtime keeps the product fully
// demoable with no keys.
export function createAgentRuntime(): AgentRuntime {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return createLlmRuntime({
      provider: "anthropic",
      apiKey: anthropicKey,
      model: process.env.AUGMENTIC_MODEL ?? "claude-sonnet-5",
      cheapModel:
        process.env.AUGMENTIC_CHEAP_MODEL ?? "claude-haiku-4-5-20251001",
    });
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return createLlmRuntime({
      provider: "openai",
      apiKey: openaiKey,
      model: process.env.AUGMENTIC_MODEL ?? "gpt-4o",
      cheapModel: process.env.AUGMENTIC_CHEAP_MODEL ?? "gpt-4o-mini",
    });
  }
  return createSimulatedRuntime();
}
