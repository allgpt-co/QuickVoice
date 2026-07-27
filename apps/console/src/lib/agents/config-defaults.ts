import type { ConfigureAgentInput } from "@/src/lib/api/resources/agents";
import type { AgentConfiguration } from "@/src/lib/api/types";
import { normalizeAgentVariables } from "@/src/lib/agents/dynamic-variables";

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful voice assistant. Be concise, polite, and on-topic. Confirm details back to the caller before taking any action.`;
export const DEFAULT_FIRST_MESSAGE = `Hi, thanks for calling. How can I help you today?`;

export function defaultConfig(): ConfigureAgentInput {
  return {
    agent_language: "en",
    firstMessage: DEFAULT_FIRST_MESSAGE,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    llmModel: "gpt-4o-mini",
    sttModel: "nova-3",
    ttsModel: "aura-2",
    use_rag: false,
    voiceId: "aura-2-asteria-en",
    data_needed: [],
    data_evaluation: [],
    initiation_webhook: null,
    post_call_webhook: null,
    preemptive_generation: false,
    ivr_navigation_enabled: true,
    timezone: "UTC",
    variables: {
      firstMessage: [],
      systemPrompt: [],
      placeholders: {},
    },
    store_call_audio: true,
    zero_pii_retention: false,
    conversation_retention_days: 30,
  };
}

// Build a full ConfigureAgentInput by layering patch over current (or defaults).
export function mergeConfig(
  current: AgentConfiguration | null | undefined,
  patch: Partial<ConfigureAgentInput>,
): ConfigureAgentInput {
  const base = defaultConfig();
  const fromCurrent: Partial<ConfigureAgentInput> = current
    ? {
        agent_language: current.agent_language,
        firstMessage: current.firstMessage,
        systemPrompt: current.systemPrompt,
        llmModel: current.llmModel,
        sttModel: current.sttModel ?? "nova-3",
        ttsModel: current.ttsModel ?? "aura-2",
        use_rag: current.use_rag,
        voiceId: current.voiceId,
        data_needed:
          (current.data_needed as ConfigureAgentInput["data_needed"]) ?? [],
        data_evaluation:
          (current.data_evaluation as ConfigureAgentInput["data_evaluation"]) ??
          [],
        initiation_webhook:
          current.initiation_webhook as ConfigureAgentInput["initiation_webhook"],
        post_call_webhook:
          current.post_call_webhook as ConfigureAgentInput["post_call_webhook"],
        preemptive_generation: current.preemptive_generation,
        ivr_navigation_enabled: current.ivr_navigation_enabled ?? true,
        timezone: current.timezone,
        variables: normalizeAgentVariables(current.variables),
        store_call_audio: current.store_call_audio,
        zero_pii_retention: current.zero_pii_retention,
        conversation_retention_days: current.conversation_retention_days,
      }
    : {};
  return { ...base, ...fromCurrent, ...patch };
}
