import { z } from "zod";
import { CallStatus,TelephonyProvider } from "../../../prisma/generated/prisma/client.js";

export const transcriptSchema = z.object({
  messageId: z.string(),
  role: z.enum(["user", "agent"]),
  message: z.string(),
  timestamp: z.string().datetime(),
});
export const extractedDataSchema = z.object({
  type: z.string(),
  name: z.string(),
  description: z.string(),
  value: z.any().nullable(),
});

export const evaluatedDataSchema = z.object({
  identifier: z.string(),
  description: z.string(),
  value: z.any().nullable(),
});

export const callLogSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  userId: z.string().optional(),
  agentId: z.string().uuid(),
  callId: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  direction: z.enum(["inbound", "outbound"]),
  durationSeconds: z.number(),
  status: z.nativeEnum(CallStatus),
  metadata: z
    .object({
      summary: z.string().optional(),
      intent: z.string().optional(),
      outboundId: z.string().uuid().nullable().optional(),
      flow: z
        .object({
          flowId: z.string().uuid().optional(),
          path: z
            .array(
              z.object({
                node_id: z.string(),
                agent_id: z.string().uuid().nullable().optional(),
                reason: z.string().nullable().optional(),
              })
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
  recordingSid: z.string(),
  transcripts: z.array(transcriptSchema),
  toNumber: z.string(),
  fromNumber: z.string(),
  provider: z.nativeEnum(TelephonyProvider),
  extractedData: z.array(extractedDataSchema).default([]),
  evaluatedData: z.array(evaluatedDataSchema).default([]),
});

export type IngestCallLogInput = z.infer<typeof callLogSchema>;
export type IngestCallLogArgs = IngestCallLogInput;

// Query params for GET /calllogs. Parsed inline in the controller against
// req.query, because the shared validate middleware only looks at req.body.
// Mirrors the approach used for searchNumbersSchema in phone.controller.ts.
export const listCallLogsQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  status: z.nativeEnum(CallStatus).optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});
export type ListCallLogsQuery = z.infer<typeof listCallLogsQuerySchema>;
export type ListCallLogsArgs = ListCallLogsQuery & { organizationId: string };

// Query params for GET /calls/:callId/transcripts.
export const listTranscriptsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});
export type ListTranscriptsQuery = z.infer<typeof listTranscriptsQuerySchema>;
export type ListTranscriptsArgs = ListTranscriptsQuery & {
  organizationId: string;
  callId: string;
};