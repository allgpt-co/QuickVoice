import { z } from "zod";

export const campaignFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "enum",
]);
export const campaignMissingBehaviorSchema = z.enum([
  "fallback",
  "omit",
  "skip",
]);
export const campaignSourceSchema = z.enum([
  "customer_attribute",
  "audience_snapshot",
  "campaign_constant",
  "computed_safe",
  "connector_lookup",
]);

export const campaignPersonalizationFieldSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    type: campaignFieldTypeSchema,
    source: campaignSourceSchema,
    required: z.boolean().default(false),
    sensitive: z.boolean().default(false),
    description: z.string().trim().max(500).optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
    missingBehavior: campaignMissingBehaviorSchema.default("skip"),
    invalidBehavior: campaignMissingBehaviorSchema.default("skip"),
    allowedValues: z.array(z.string().trim().min(1)).max(100).optional(),
    maxLength: z.number().int().min(1).max(2000).default(500),
    locale: z.string().trim().min(2).max(32).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "enum" && !field.allowedValues?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedValues"],
        message: "Enum fields require allowedValues",
      });
    }
    if (
      (field.missingBehavior === "fallback" ||
        field.invalidBehavior === "fallback") &&
      field.defaultValue === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultValue"],
        message: "Fallback behavior requires defaultValue",
      });
    }
  });

export const campaignPersonalizationSchema = z.object({
  version: z.number().int().positive().default(1),
  fields: z.array(campaignPersonalizationFieldSchema).min(1).max(200),
  templates: z.record(z.string(), z.string().max(20_000)).default({}),
});

export const campaignRecipientInputSchema = z.object({
  recipientKey: z.string().trim().min(1).max(200),
  rowNumber: z.number().int().positive().optional(),
  values: z.record(z.string(), z.unknown()).default({}),
});

export const campaignPreflightRequestSchema = z.object({
  schema: campaignPersonalizationSchema,
  recipients: z.array(campaignRecipientInputSchema).min(1).max(10_000),
  includeSensitivePreview: z.boolean().default(false),
});

export const campaignExperimentVariantSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(120),
  allocationBps: z.number().int().min(0).max(10_000),
  isControl: z.boolean().default(false),
  configVersion: z.record(z.string(), z.unknown()).default({}),
});

export const campaignExperimentDefinitionSchema = z
  .object({
    experimentId: z.string().trim().min(1).max(120),
    version: z.number().int().positive().default(1),
    hypothesis: z.string().trim().min(1).max(1000),
    primaryMetric: z.string().trim().min(1).max(120),
    guardrailMetrics: z.array(z.string().trim().min(1).max(120)).default([]),
    unit: z.enum(["recipient", "household", "account"]).default("recipient"),
    stoppingPolicy: z.string().trim().min(1).max(1000),
    variants: z.array(campaignExperimentVariantSchema).min(2).max(20),
  })
  .superRefine((definition, ctx) => {
    const total = definition.variants.reduce(
      (sum, variant) => sum + variant.allocationBps,
      0,
    );
    if (total !== 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variants"],
        message: "Variant allocations must sum to 10000 basis points",
      });
    }
    if (
      definition.variants.filter((variant) => variant.isControl).length !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variants"],
        message: "Exactly one control variant is required",
      });
    }
  });

export const campaignAssignmentRequestSchema = z.object({
  experiment: campaignExperimentDefinitionSchema,
  unitKeys: z.array(z.string().trim().min(1).max(200)).min(1).max(100_000),
  excludedUnitKeys: z.record(z.string(), z.string()).default({}),
});

export const campaignConversionEventSchema = z.object({
  goalKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/),
  dedupeKey: z.string().trim().min(1).max(256),
  externalCustomerId: z.string().trim().min(1).max(256),
  occurredAt: z.coerce.date(),
  valueCents: z.number().int().min(0).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  source: z.string().trim().min(1).max(120),
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export const campaignReportRequestSchema = z.object({
  randomized: z.boolean().default(false),
  attempts: z
    .array(
      z.object({
        unitKey: z.string().trim().min(1),
        variantKey: z.string().trim().min(1).optional(),
        connected: z.boolean().default(false),
        outcome: z.string().trim().optional(),
        costCents: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
  conversions: z
    .array(
      z.object({
        unitKey: z.string().trim().min(1),
        variantKey: z.string().trim().min(1).optional(),
        goalKey: z.string().trim().min(1),
        valueCents: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
});

export type CampaignPersonalizationSchemaInput = z.infer<
  typeof campaignPersonalizationSchema
>;
export type CampaignPreflightRequest = z.infer<
  typeof campaignPreflightRequestSchema
>;
export type CampaignExperimentDefinition = z.infer<
  typeof campaignExperimentDefinitionSchema
>;
export type CampaignAssignmentRequest = z.infer<
  typeof campaignAssignmentRequestSchema
>;
export type CampaignConversionEventInput = z.infer<
  typeof campaignConversionEventSchema
>;
export type CampaignReportRequest = z.infer<typeof campaignReportRequestSchema>;
