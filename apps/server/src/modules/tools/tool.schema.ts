import { z } from "zod";
import { containsReservedSecretEnvelope } from "../../lib/secrets.js";

const kvPair = z
  .object({
    key: z.string(),
    value: z.string().nullable(),
    type: z.enum(["Value", "Secret"]).optional(),
    redacted: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.value === null && !data.redacted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "A value is required",
      });
    }
  });

const toolParam = z.object({
  name: z.string(),
  type: z.enum(["String", "Number", "Boolean"]),
  valueType: z.enum(["LLM Prompt", "Static Value", "Dynamic Variable"]),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .optional()
    .nullable(),
  description: z.string(),
  allowedValues: z.array(z.string()).default([]),
  required: z.boolean().default(false),
});

const toolFieldsSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().min(1, "Description is required").max(500),
  api_url: z.string().url("Must be a valid URL"),
  api_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  api_headers: z.array(kvPair).optional().nullable(),
  api_body: z.array(toolParam).optional().nullable(),
  api_query_params: z.array(toolParam).optional().nullable(),
  api_path_params: z.array(toolParam).optional().nullable(),
  response_timeout_secs: z.number().int().min(1).max(15).optional().nullable(),
  dynamic_variables: z.array(kvPair).optional().nullable(),
  disable_interruptions: z.boolean(),
  force_pre_tool_speech: z.boolean(),
});

export const createToolSchema = toolFieldsSchema
  .extend({
    api_method: toolFieldsSchema.shape.api_method.default("POST"),
    disable_interruptions:
      toolFieldsSchema.shape.disable_interruptions.default(false),
    force_pre_tool_speech:
      toolFieldsSchema.shape.force_pre_tool_speech.default(true),
  })
  .refine((data) => !containsReservedSecretEnvelope(data), {
    message: "Encrypted secret envelopes cannot be submitted",
  });

export const updateToolSchema = toolFieldsSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  })
  .refine((data) => !containsReservedSecretEnvelope(data), {
    message: "Encrypted secret envelopes cannot be submitted",
  });

export type CreateToolInput = z.infer<typeof createToolSchema>;
export type UpdateToolInput = z.infer<typeof updateToolSchema>;

export type CreateToolArgs = CreateToolInput & {
  organizationId: string;
  userId: string | null;
};
