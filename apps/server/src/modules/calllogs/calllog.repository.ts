import { Prisma } from "../../../prisma/generated/prisma/client.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import prisma from "../../config/prisma.js";
import { redactJson, redactText } from "../../lib/redaction.js";
import type {
  IngestCallLogArgs,
  ListCallLogsArgs,
  ListTranscriptsArgs,
} from "./calllog.schema.js";
import { widgetRoomBelongsToOrg } from "../widgets/widget.repository.js";

// Create a CallLog, its CallTranscript children, and — best-effort — link the
// originating OutboundCall in one transaction. The OutboundCall linkage is
// deliberately non-fatal: a stale or cross-org outboundId logs a warning and
// the CallLog is still persisted (per product decision #4).
export const saveCallLog = async (input: IngestCallLogArgs) => {
  const redactPii = process.env.CALL_LOG_PII_REDACTION !== "false";

  return prisma.$transaction((tx) =>
    saveCallLogInTransaction(tx, input, redactPii),
  );
};

export const saveCallLogInTransaction = async (
  tx: Prisma.TransactionClient,
  input: IngestCallLogArgs,
  redactPii: boolean,
) => {
  const { callerId, metadata } = buildCallLogIdentityFields(input, redactPii);
  const inserted = await tx.callLog.createMany({
    data: {
      callId: input.callId,
      organizationId: input.organizationId,
      agentId: input.agentId,
      userId: input.userId,
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime),
      durationSeconds: input.durationSeconds,
      status: input.status,
      direction: input.direction,
      audioRecordingPath: input.recordingSid,
      callerId,
      metadata,
      dataExtracted: redactPii
        ? redactJson(input.extractedData)
        : input.extractedData,
      dataEvaluation: redactPii
        ? redactJson(input.evaluatedData)
        : input.evaluatedData,
    },
    skipDuplicates: true,
  });

  const callLog = await tx.callLog.findUnique({
    where: { callId: input.callId },
  });
  if (!callLog || callLog.organizationId !== input.organizationId) {
    throw new BadRequestError("Call identifier is already in use");
  }

  if (inserted.count === 0) {
    return callLog;
  }

  if (input.transcripts.length > 0) {
    await tx.callTranscript.createMany({
      data: input.transcripts.map((transcript) => ({
        callLogId: callLog.callId,
        speaker: transcript.role,
        messageText: redactPii
          ? redactText(transcript.message)
          : transcript.message,
        timestamp: new Date(transcript.timestamp),
        isPiiRedacted: redactPii,
      })),
    });
  }

  const outboundId = input.metadata?.outboundId ?? null;
  if (outboundId) {
    // updateMany with the composite {outboundId, organizationId} predicate
    // is the tenant-safe write. A row in a different org yields count: 0.
    const linked = await tx.outboundCall.updateMany({
      where: { outboundId, organizationId: input.organizationId },
      data: { callLogId: callLog.callId, status: input.status },
    });
    if (linked.count === 0) {
      console.warn("[calllogs] ingest: outboundId not linkable", {
        outboundId,
        callId: callLog.callId,
        organizationId: input.organizationId,
      });
    }
  }

  return callLog;
};

export function buildCallLogIdentityFields(
  input: IngestCallLogArgs,
  redactPii: boolean,
) {
  // The external party's number goes into callerId. On inbound it's the
  // caller; on outbound it's the callee. Keep structured phone fields raw so
  // call-log tables and details can show the actual number; redact only
  // free-form text that may contain incidental PII.
  const callerId =
    (input.direction === "inbound" ? input.fromNumber : input.toNumber) || null;
  const summary = input.metadata?.summary ?? "";
  const intent = input.metadata?.intent ?? "";
  const baseMetadata = (
    redactPii
      ? redactJson(jsonObject(input.metadata))
      : jsonObject(input.metadata)
  ) as Prisma.InputJsonObject;
  const metadata = {
    ...baseMetadata,
    summary: redactPii ? redactText(summary) : summary,
    intent: redactPii ? redactText(intent) : intent,
    fromNumber: input.fromNumber,
    toNumber: input.toNumber,
    provider: input.provider,
  } satisfies Prisma.InputJsonObject;

  return { callerId, metadata };
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Prisma.InputJsonObject;
}

export const listByOrg = async (args: ListCallLogsArgs) => {
  const {
    organizationId,
    agentId,
    status,
    direction,
    from,
    to,
    limit,
    cursor,
  } = args;

  const where: Prisma.CallLogWhereInput = {
    organizationId,
    deleted: false,
    ...(agentId && { agentId }),
    ...(status && { status }),
    ...(direction && { direction }),
    ...((from || to) && {
      startTime: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  };

  // Over-fetch by 1 so the service can decide whether a next page exists
  // without a second count query. Cursor pagination is stable because
  // (startTime, callId) is a total order.
  return prisma.callLog.findMany({
    where,
    orderBy: [{ startTime: "desc" }, { callId: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { callId: cursor }, skip: 1 }),
  });
};

export const getCallByIdForOrg = async (
  callId: string,
  organizationId: string,
) => {
  // findFirst with the composite {callId, organizationId} predicate prevents
  // callers from reading a row that belongs to another org.
  return prisma.callLog.findFirst({
    where: { callId, organizationId, deleted: false },
  });
};

export const getCallForDeletion = async (
  callId: string,
  organizationId: string,
) =>
  prisma.callLog.findFirst({
    where: { callId, organizationId, deleted: false },
    select: {
      callId: true,
      audioRecordingPath: true,
    },
  });

export const getTranscriptsByCallId = async (args: ListTranscriptsArgs) => {
  const { callId, organizationId, limit, cursor } = args;

  // Join through callLog so a transcript belonging to another org or a
  // soft-deleted call is never returned.
  return prisma.callTranscript.findMany({
    where: {
      callLogId: callId,
      callLog: { organizationId, deleted: false },
    },
    orderBy: { timestamp: "asc" },
    take: limit + 1,
    ...(cursor && { cursor: { callTransId: cursor }, skip: 1 }),
  });
};

export const liveRoomBelongsToOrg = async (
  organizationId: string,
  roomName: string,
) => {
  if (roomName.startsWith("widget_")) {
    return widgetRoomBelongsToOrg(organizationId, roomName);
  }

  if (roomName.startsWith("outbound_")) {
    const outboundId = roomName.slice("outbound_".length);
    const count = await prisma.outboundCall.count({
      where: { outboundId, organizationId },
    });
    return count > 0;
  }

  const numbers = await prisma.phoneNumber.findMany({
    where: { organizationId },
    select: { number: true },
  });
  return numbers.some((number) => roomName.includes(number.number));
};

export const listAgentNamesForOrg = async (
  organizationId: string,
  agentIds: string[],
) => {
  if (agentIds.length === 0) return [];
  return prisma.agent.findMany({
    where: {
      organizationId,
      agentId: { in: agentIds },
    },
    select: { agentId: true, name: true },
  });
};

export const deleteCallLog = async (
  callId: string,
  organizationId: string,
  expectedRecordingPath: string | null,
) => {
  return prisma.$transaction(async (tx) => {
    const result = await tx.callLog.updateMany({
      where: {
        callId,
        organizationId,
        deleted: false,
        audioRecordingPath: expectedRecordingPath,
      },
      data: {
        deleted: true,
        audioRecordingPath: null,
        callerId: null,
        metadata: Prisma.JsonNull,
        dataExtracted: [],
        dataEvaluation: [],
      },
    });
    if (result.count === 0) return false;

    await tx.callTranscript.deleteMany({
      where: { callLogId: callId },
    });
    return true;
  });
};
