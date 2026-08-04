import type { ConfigureAgentInput } from "./agent.schema.js";

type AgentTemplateSlug =
  | "business"
  | "medical"
  | "questionnaire"
  | "support"
  | "blank";
type ConfiguredTemplateSlug = Exclude<AgentTemplateSlug, "blank">;

const baseConfig = {
  agent_language: "en",
  llmModel: "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0",
  sttModel: "deepgram/nova-3",
  ttsModel: "deepgram/aura-2",
  use_rag: false,
  voiceId: "aura-2-asteria-en",
  initiation_webhook: null,
  post_call_webhook: null,
  variables: {
    firstMessage: [],
    systemPrompt: [],
    placeholders: {},
  },
  preemptive_generation: false,
  ivr_navigation_enabled: true,
  timezone: "UTC",
} satisfies Omit<
  ConfigureAgentInput,
  "firstMessage" | "systemPrompt" | "data_needed" | "data_evaluation"
>;

const questionnaireDataNeeded = Array.from({ length: 20 }, (_, index) => {
  const questionNumber = index + 1;
  return {
    id: `question_${questionNumber}_answer`,
    type: "String",
    name: `Question ${questionNumber} answer`,
    description: `Patient response to question_${questionNumber} from the outbound batch CSV when that question is present`,
  };
});
const questionnaireQuestionVariables = Array.from(
  { length: 20 },
  (_, index) => `question_${index + 1}`,
);
const questionnaireSystemPrompt = [
  "You are conducting a structured outbound questionnaire. Use the recipient dynamic variables from the batch CSV. If patient_name is provided, address the patient by name.",
  "Ask only non-empty questions from question_1 through question_20, in numeric order. Skip blank values and any value that still looks like a double-brace placeholder.",
  "Ask exactly one question at a time and wait for the answer before moving to the next question.",
  "After each answer, immediately call record_call_extracted_data with the matching field id question_N_answer and the patient's exact response.",
  "Do not diagnose, provide medical advice, or make clinical decisions. If the patient describes an emergency or urgent symptoms, tell them to call emergency services or seek immediate medical care.",
  "If the patient refuses, asks to stop, or cannot continue, end politely and record the reason in refusal_reason when available.",
  "",
  "Recipient:",
  "patient_name: {{patient_name}}",
  "",
  "Questions:",
  ...questionnaireQuestionVariables.map((name) => `${name}: {{${name}}}`),
].join("\n");

const configuredTemplates: Record<ConfiguredTemplateSlug, ConfigureAgentInput> =
  {
    business: {
      ...baseConfig,
      firstMessage:
        "Hi, thanks for calling. I can help answer questions, capture details, or route the next step. How can I help?",
      systemPrompt:
        "You are a professional business phone agent. Keep responses concise and clear. Identify why the caller is calling, answer using known business information when available, collect contact details when follow-up is needed, and confirm the next step before ending the call. If the request needs a human, explain that a team member will follow up.",
      data_needed: [
        {
          id: "caller_name",
          type: "String",
          name: "Caller name",
          description: "Name the caller provides during the call",
        },
        {
          id: "callback_number",
          type: "String",
          name: "Callback number",
          description: "Best phone number for follow-up",
        },
        {
          id: "reason_for_call",
          type: "String",
          name: "Reason for call",
          description: "Short summary of what the caller needs",
        },
      ],
      data_evaluation: [
        {
          id: "human_follow_up_needed",
          name: "Human follow-up needed",
          criteria:
            "Whether the caller needs a person to follow up after the call",
        },
      ],
    },
    medical: {
      ...baseConfig,
      firstMessage:
        "Hi, thanks for calling. I can help with scheduling, intake details, or a message for the care team. How can I help today?",
      systemPrompt:
        "You are a careful medical front-desk phone agent. Help with scheduling, intake details, and messages for staff. Do not diagnose, provide medical advice, or make clinical decisions. If the caller describes an emergency or urgent symptoms, tell them to call emergency services or seek immediate medical care. Confirm names, dates, callback numbers, and next steps clearly.",
      data_needed: [
        {
          id: "patient_name",
          type: "String",
          name: "Patient name",
          description: "Patient name as provided by the caller",
        },
        {
          id: "callback_number",
          type: "String",
          name: "Callback number",
          description: "Best phone number for the care team to use",
        },
        {
          id: "appointment_reason",
          type: "String",
          name: "Appointment reason",
          description:
            "Brief non-diagnostic reason for the appointment or message",
        },
      ],
      data_evaluation: [
        {
          id: "urgent_or_emergency",
          name: "Urgent or emergency",
          criteria:
            "Whether the caller described an emergency or urgent medical concern",
        },
      ],
    },
    questionnaire: {
      ...baseConfig,
      firstMessage:
        "Hi, this is a short questionnaire call. I will ask a few questions and record your responses.",
      systemPrompt: questionnaireSystemPrompt,
      data_needed: [
        ...questionnaireDataNeeded,
        {
          id: "refusal_reason",
          type: "String",
          name: "Refusal reason",
          description:
            "Why the patient refused, stopped, or could not complete the questionnaire",
        },
      ],
      data_evaluation: [
        {
          id: "questionnaire_completed",
          name: "Questionnaire completed",
          criteria:
            "Whether all provided non-empty batch questions were asked and answered",
        },
        {
          id: "urgent_or_emergency",
          name: "Urgent or emergency",
          criteria:
            "Whether the patient described an emergency or urgent medical concern",
        },
      ],
      variables: {
        firstMessage: [],
        systemPrompt: ["patient_name", ...questionnaireQuestionVariables],
        placeholders: {},
      },
    },
    support: {
      ...baseConfig,
      firstMessage:
        "Hi, thanks for contacting support. Tell me what happened, and I will collect the details needed for the next step.",
      systemPrompt:
        "You are a customer support phone agent. Listen carefully, ask one focused question at a time, collect the issue summary and contact information, and confirm what will happen next. Be calm and specific. Do not promise fixes, refunds, or timelines unless they are provided by connected tools or verified knowledge.",
      data_needed: [
        {
          id: "caller_name",
          type: "String",
          name: "Caller name",
          description: "Name the caller provides during the support call",
        },
        {
          id: "issue_summary",
          type: "String",
          name: "Issue summary",
          description: "Short summary of the support problem",
        },
        {
          id: "urgency",
          type: "String",
          name: "Urgency",
          description: "How urgent the caller says the issue is",
        },
      ],
      data_evaluation: [
        {
          id: "escalation_needed",
          name: "Escalation needed",
          criteria:
            "Whether the support issue should be escalated to a human team member",
        },
      ],
    },
  };

export function templateConfigFor(templateId: string | null | undefined) {
  if (!isConfiguredTemplateSlug(templateId)) return null;
  return cloneConfig(configuredTemplates[templateId]);
}

function isConfiguredTemplateSlug(
  value: string | null | undefined,
): value is ConfiguredTemplateSlug {
  return (
    value === "business" ||
    value === "medical" ||
    value === "questionnaire" ||
    value === "support"
  );
}

function cloneConfig(config: ConfigureAgentInput): ConfigureAgentInput {
  return {
    ...config,
    data_needed: config.data_needed.map((item) => ({ ...item })),
    data_evaluation: config.data_evaluation.map((item) => ({ ...item })),
    variables: config.variables
      ? {
          firstMessage: [...config.variables.firstMessage],
          systemPrompt: [...config.variables.systemPrompt],
          placeholders: { ...(config.variables.placeholders ?? {}) },
        }
      : undefined,
  };
}
