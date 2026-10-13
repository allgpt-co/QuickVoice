import { z } from "zod";
import { containsReservedSecretEnvelope } from "../../lib/secrets.js";

const agentTemplateSlugSchema = z.enum([
  "business",
  "medical",
  "blank",
  "support",
]);

const agentTemplateIdSchema = z
  .union([z.string().uuid(), agentTemplateSlugSchema])
  .nullable()
  .refine(
    (value) =>
      value === null ||
      agentTemplateSlugSchema.safeParse(value).success ||
      z.string().uuid().safeParse(value).success,
    "Invalid template ID",
  );

// Agent creation schema — organizationId and userId are NOT accepted from the
// client. They are injected server-side from req.auth by the controller so
// that clients cannot target another organization.
export const createAgentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Agent name must be at least 2 characters")
    .max(100, "Agent name must be at most 100 characters"),
  isActive: z.boolean(),
  templateId: agentTemplateIdSchema,
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

// Arguments passed into the service layer (request input + server-supplied
// organization / user context).
export type CreateAgentArgs = CreateAgentInput & {
  organizationId: string;
  userId: string;
};

// Agent update schema — all fields optional, body must not be empty. Same
// server-injection rules as create: organizationId / userId / agentSlug are
// never accepted from the client.
export const updateAgentSchema = createAgentSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const dataItemSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    type: z.enum([
      "string",
      "String",
      "text",
      "number",
      "boolean",
      "date",
      "choice",
    ]),
    name: z.string().trim().min(1, "Data item name is required").max(100),
    description: z.string().trim().min(5, "Description is required").max(500),
    options: z
      .array(z.string().trim().min(1).max(100))
      .min(2)
      .max(20)
      .optional(),
  })
  .refine(
    (item) =>
      !item.options ||
      new Set(item.options.map((option) => option.toLowerCase())).size ===
        item.options.length,
    {
      message: "Choice options must be unique",
      path: ["options"],
    },
  );
export const dataEvaluationSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1, "Data evaluation name is required").max(100),
  criteria: z
    .string()
    .trim()
    .min(1, "Data evaluation criteria is required")
    .max(500),
});

function uniqueAnalysisTargets(items: Array<{ id: string; name: string }>) {
  const owners = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    for (const key of [item.id, item.name].map((value) =>
      value.toLowerCase(),
    )) {
      if (owners.has(key) && owners.get(key) !== index) return false;
      owners.set(key, index);
    }
  }
  return true;
}

const webhookValueSchema = z
  .object({
    value: z.string().nullable(),
    type: z.enum(["Value", "Secret"]),
    redacted: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.value === null && !(data.type === "Secret" && data.redacted)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "A value is required",
      });
    }
  });

export const initiation_webhookSchema = z
  .object({
    webhook_url: z.string().url(),
    method: z.enum(["POST", "GET"]),
    dynamic_variables: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), webhookValueSchema).optional(),
    body: z.record(z.string(), webhookValueSchema).optional(),
  })
  .nullable();

export const post_call_webhookSchema = z
  .object({
    webhook_url: z.string().url(),
    method: z.enum(["POST"]),
    headers: z.record(z.string(), webhookValueSchema).optional(),
    transcript: z.boolean(),
    audio_url: z.boolean(),
  })
  .nullable();

export const configureAgentSchema = z
  .object({
    agent_language: z.string(),
    firstMessage: z
      .string()
      .min(5, "First message must be at least 5 characters"),
    systemPrompt: z
      .string()
      .min(10, "System prompt must be at least 10 characters"),
    llmModel: z.string(),
    sttModel: z.string().min(1, "STT model is required"),
    ttsModel: z.string().min(1, "TTS model is required"),
    // tokenLimit: z.number().int().positive().default(4096),
    use_rag: z.boolean(),
    voiceId: z.string().min(1, "Voice ID is required"),
    data_needed: z
      .array(dataItemSchema)
      .max(20)
      .refine(uniqueAnalysisTargets, "Field IDs and names must be unique"),
    data_evaluation: z
      .array(dataEvaluationSchema)
      .max(20)
      .refine(uniqueAnalysisTargets, "Evaluation IDs and names must be unique"),
    initiation_webhook: initiation_webhookSchema,
    post_call_webhook: post_call_webhookSchema,
    variables: z
      .object({
        firstMessage: z.array(z.string()),
        systemPrompt: z.array(z.string()),
        placeholders: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    preemptive_generation: z.boolean(),
    ivr_navigation_enabled: z.boolean().default(true),
    timezone: z.string().min(1, "Timezone is required"),
    // Optional for API clients created before privacy controls became writable.
    store_call_audio: z.boolean().optional(),
    zero_pii_retention: z.boolean().optional(),
    conversation_retention_days: z.number().int().min(1).max(3_650).optional(),
    // use_flash_call: z.boolean().default(false),
    // tts_output_format: z.string().default("mp3"),
    // optimize_streaming_latency: z.boolean().default(false),
    // voice_stability: z.number().min(0).max(1),
    // voice_speed: z.number().min(0.5).max(2),
    // voice_similarity_boost: z.number().min(0).max(1),
    // fetch_initiation_webhook_url: z.string().optional(),
    // post_call_webhook_url: z.string().optional(),
    concurrent_calls_limit: z.number().int().min(1).max(100).optional(),
    daily_calls_limit: z.number().int().min(1).max(100_000).optional(),
    // turn_timeout_seconds: z.number().int().positive(),
    // silence_end_call_timeout_seconds: z.number().int().positive(),
    // max_conversation_duration_seconds: z.number().int().positive(),
    // user_input_audio_format: z.string(),
    // enable_auth_for_agent_api: z.boolean().default(false),
  })
  .refine((data) => !(data.zero_pii_retention && data.store_call_audio), {
    message: "Call audio cannot be stored when zero-PII retention is enabled",
    path: ["store_call_audio"],
  })
  .refine((data) => !containsReservedSecretEnvelope(data), {
    message: "Encrypted secret envelopes cannot be submitted",
  });

export type ConfigureAgentInput = z.infer<typeof configureAgentSchema>;
export type ConfigureAgentArgs = ConfigureAgentInput & {
  organizationId: string;
  userId: string;
  agentId: string;
};
export type DataItem = z.infer<typeof dataItemSchema>;
export type DataEvaluation = z.infer<typeof dataEvaluationSchema>;
