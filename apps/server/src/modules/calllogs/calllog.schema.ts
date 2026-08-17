import { z } from "zod";
import { CallStatus } from "../../../prisma/generated/prisma/client.js";

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

export const callLogMetadataSchema = z
  .object({
    summary: z.string(),
    intent: z.string(),
    outboundId: z.string().uuid().nullable(),
  })
  .catchall(z.unknown());

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
  metadata: callLogMetadataSchema.optional(),
  recordingSid: z.string(),
  transcripts: z.array(transcriptSchema),
  toNumber: z.string().default(""),
  fromNumber: z.string().default(""),
  provider: z.string().trim().min(1).default("WEB_WIDGET"),
  extractedData: z.array(extractedDataSchema).default([]),
  evaluatedData: z.array(evaluatedDataSchema).default([]),
});

export type IngestCallLogInput = z.infer<typeof callLogSchema>;
export type IngestCallLogArgs = IngestCallLogInput;

// Query params for GET /calllogs. Parsed inline in the controller against
// req.query, because the shared validate middleware only looks at req.body.
// Mirrors the approach used for searchNumbersSchema in phone.controller.ts.
export const listCallLogsQuerySchema = z
  .object({
    agentId: z.string().uuid().optional(),
    status: z.nativeEnum(CallStatus).optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().optional(),
  })
  .refine(
    (data) =>
      !data.from ||
      !data.to ||
      new Date(data.from).getTime() <= new Date(data.to).getTime(),
    {
      path: ["to"],
      message: "to must be on or after from",
    },
  );
export type ListCallLogsQuery = z.infer<typeof listCallLogsQuerySchema>;
export type ListCallLogsArgs = ListCallLogsQuery & { organizationId: string };

// Query params for GET /calls/:callId/transcripts.
export const listTranscriptsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});
export const endLiveCallSchema = z.object({
  roomName: z.string().trim().min(1).max(256),
});
export type EndLiveCallInput = z.infer<typeof endLiveCallSchema>;

export type ListTranscriptsQuery = z.infer<typeof listTranscriptsQuerySchema>;
export type ListTranscriptsArgs = ListTranscriptsQuery & {
  organizationId: string;
  callId: string;
};
