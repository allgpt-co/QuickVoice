import { z } from "zod";

const customMcpUrlSchema = z
  .string()
  .trim()
  .url()
  .superRefine((value, context) => {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom MCP URL must use HTTPS",
      });
    }
    if (parsed.username || parsed.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL credentials are not allowed",
      });
    }
  });

export const connectMcpSchema = z.object({
  catalogSlug: z.string().trim().min(1).optional(),
  customUrl: customMcpUrlSchema.optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
}).refine((data) => Boolean(data.catalogSlug) !== Boolean(data.customUrl), {
  message: "Provide either catalogSlug or customUrl",
});

export const attachMcpSchema = z.object({
  enabled: z.boolean().default(true),
});

const toolArgumentsSchema = z.record(z.string(), z.unknown()).default({}).refine(
  (value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 8192,
  "Tool arguments must be at most 8 KB",
);

export const executeMcpToolSchema = z.object({
  agentId: z.string().min(1).optional(),
  callId: z.string().min(1).optional(),
  arguments: toolArgumentsSchema,
});

export const testMcpToolSchema = z.object({
  toolName: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  arguments: toolArgumentsSchema,
});

export type ConnectMcpInput = z.infer<typeof connectMcpSchema>;
export type ExecuteMcpToolInput = z.infer<typeof executeMcpToolSchema>;
