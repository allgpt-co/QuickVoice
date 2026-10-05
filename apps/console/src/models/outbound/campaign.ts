import { z } from "zod";
import { campaignScheduleToIso } from "./campaign-schedule";

import { serializeCsvRows } from "@/src/lib/export-csv";

export const BATCH_TEMPLATE_BASE_COLUMNS = [
  "phone_number",
  "language",
  "voice_id",
  "first_message",
  "prompt",
] as const;

export function buildBatchTemplateHeader(variableNames: string[] = []) {
  return serializeCsvRows([
    [...BATCH_TEMPLATE_BASE_COLUMNS, ...uniqueColumns(variableNames)],
  ]);
}

export function buildBatchTemplateCsv(variableNames: string[] = []) {
  return `${buildBatchTemplateHeader(variableNames)}\n`;
}

export const BATCH_TEMPLATE_HEADER = buildBatchTemplateHeader();

function uniqueColumns(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export const batchCampaignSchema = z
  .object({
    name: z.string().trim().min(1, "Campaign name is required"),
    agentId: z.string().uuid(),
    fromNumber: z.string().min(10, "From number must be at least 10 digits"),
    file: z.instanceof(File),
    scheduleMode: z.enum(["instant", "later"]),
    scheduledAt: z.string().optional(),
    timezone: z.string().default("UTC"),
    ringingTimeoutSeconds: z.coerce.number().int().min(10).max(180),
  })
  .transform((data, ctx) => {
    if (data.scheduleMode === "instant") return { ...data, scheduledAt: undefined };
    try {
      if (!data.scheduledAt) throw new Error("Schedule time is required");
      return { ...data, scheduledAt: campaignScheduleToIso(data.scheduledAt, data.timezone) };
    } catch (error) {
      ctx.addIssue({
        path: ["scheduledAt"],
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Invalid schedule time",
      });
      return z.NEVER;
    }
  });

export type BatchCampaignFormInput = z.infer<typeof batchCampaignSchema>;
