import { z } from "zod";

export const createTopUpCheckoutSchema = z.object({
  amountCents: z
    .number()
    .int()
    .min(500, "Minimum top-up is $5")
    .max(50_000, "Maximum top-up is $500")
    .refine((value) => value % 500 === 0, {
      message: "Top-ups must be in $5 increments",
    }),
});

export const updateAutoRechargeSchema = z
  .object({
    enabled: z.boolean(),
    thresholdCents: z
      .number()
      .int()
      .min(500)
      .max(50_000)
      .refine((value) => value % 500 === 0, {
        message: "Threshold must be in $5 increments",
      }),
    amountCents: z
      .number()
      .int()
      .min(500)
      .max(50_000)
      .refine((value) => value % 500 === 0, {
        message: "Reload amount must be in $5 increments",
      }),
  })
  .refine((value) => value.amountCents > value.thresholdCents, {
    path: ["amountCents"],
    message: "Reload amount must be greater than the threshold",
  });

const modelUsageEntrySchema = z
  .object({
    type: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const callUsageSnapshotSchema = z.object({
  callId: z.string().min(1).max(255),
  sessionId: z.string().min(1).max(255).optional(),
  roomName: z.string().min(1).max(255),
  organizationId: z.string().min(1),
  userId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  telephonyProvider: z
    .string()
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(["TWILIO", "TELNYX"]))
    .optional(),
  providerCallId: z.string().min(1).max(255).optional(),
  sequence: z.number().int().nonnegative(),
  connectedSeconds: z.number().finite().nonnegative(),
  modelUsage: z.array(modelUsageEntrySchema).max(100),
  final: z.boolean(),
});

export const transactionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export type CreateTopUpCheckoutInput = z.infer<
  typeof createTopUpCheckoutSchema
>;
export type UpdateAutoRechargeInput = z.infer<
  typeof updateAutoRechargeSchema
>;
export type CallUsageSnapshotInput = z.infer<typeof callUsageSnapshotSchema>;
