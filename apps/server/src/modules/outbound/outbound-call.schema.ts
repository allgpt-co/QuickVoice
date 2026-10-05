import { campaignLocalTime } from "./campaign-time.js";
import { z } from "zod";
import {
  CallStatus,
  OutboundCallMode,
} from "../../../prisma/generated/prisma/client.js";
import { campaignBatchIntelligenceSchema } from "./outbound-campaign-intelligence.schema.js";

export const quickOutboundCallSchema = z
  .object({
    agentId: z.string().uuid(),
    phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
    fromNumber: z.string().min(10, "From number must be at least 10 digits"),
    firstMessage: z.string().optional(),
    systemPrompt: z.string().optional(),
    username: z.string().optional(),
    dynamicVariables: z.record(z.string(), z.string()).optional(),
  })
  .strip();

export type QuickOutboundCallInput = z.infer<typeof quickOutboundCallSchema>;
export type QuickOutboundCallArgs = QuickOutboundCallInput & {
  organizationId: string;
  userId: string;
};

const statusSchema = z.preprocess((value) => {
  if (typeof value === "string") return value.toUpperCase();
  return value;
}, z.nativeEnum(CallStatus));

export const listOutboundCallsQuerySchema = z
  .object({
    agentId: z.string().uuid().optional(),
    status: statusSchema.optional(),
    mode: z.nativeEnum(OutboundCallMode).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  })
  .strip();

export const cancelOutboundCallSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strip();

export type ListOutboundCallsQuery = z.infer<
  typeof listOutboundCallsQuerySchema
>;
export type ListOutboundCallsArgs = ListOutboundCallsQuery & {
  organizationId: string;
};

export type CancelOutboundCallInput = z.infer<typeof cancelOutboundCallSchema>;
const supportedBatchExtension = /(\.csv|\.xlsx)$/i;
const scheduledCampaignTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const campaignTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Timezone must be a valid IANA timezone" },
  );

export const batchUploadUrlQuerySchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((value) => supportedBatchExtension.test(value), {
      message: "Batch file must be a CSV or XLSX file",
    }),
  contentType: z.string().trim().min(1).max(255),
  fileSize: z.coerce.number().int().positive(),
});

export const createBatchCampaignSchema = z
  .object({
    name: z.string().trim().min(1, "Campaign name is required"),
    agentId: z.string().uuid(),
    fromNumber: z.string().min(10, "From number must be at least 10 digits"),
    sourceFileKey: z
      .string()
      .min(1, "Uploaded file key is required")
      .max(1_024),
    sourceFileName: z
      .string()
      .min(1, "Uploaded file name is required")
      .max(255),
    scheduledAt: z.string().optional().nullable(),
    timezone: campaignTimezoneSchema.default("UTC"),
    ringingTimeoutSeconds: z.coerce.number().int().min(10).max(180).default(60),
    campaignIntelligence: campaignBatchIntelligenceSchema.optional(),
  })
  .strip()
  .transform((input, ctx) => {
    if (input.scheduledAt == null) return { ...input, scheduledAt: input.scheduledAt === null ? null : undefined };
    try {
      const scheduledAt = /(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt)
        ? scheduledCampaignTimeSchema.parse(input.scheduledAt)
        : campaignLocalTime(input.scheduledAt, input.timezone);
      return { ...input, scheduledAt };
    } catch {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Invalid campaign date, time or timezone" });
      return z.NEVER;
    }
  });

export const listBatchCampaignsQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
});

export type BatchUploadUrlQuery = z.infer<typeof batchUploadUrlQuerySchema>;
export type CreateBatchCampaignInput = z.infer<
  typeof createBatchCampaignSchema
>;
export type CreateBatchCampaignArgs = CreateBatchCampaignInput & {
  organizationId: string;
  userId: string;
};
export type ListBatchCampaignsArgs = z.infer<
  typeof listBatchCampaignsQuerySchema
> & {
  organizationId: string;
};
