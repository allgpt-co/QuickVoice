import { kbStatus, Prisma } from "../../../prisma/generated/prisma/client.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import prisma from "../../config/prisma.js";
import {
  createCompletedKbMetadata,
  createFailedKbMetadata,
  createProcessingKbMetadata,
  createQueuedKbMetadata,
  createRetryingKbMetadata,
  sanitizeKbFailureReason,
} from "./kb-job-metadata.js";
import type { CreateKbArgs, ListKbArgs } from "./kb.schema.js";
import type {
  KbProcessingFailure,
  KbProcessingSummary,
} from "./kb-processing-result.js";

// Create one KnowledgeSource row per document in a single transaction.
// All start as PROCESSING — Agent.knowledgeSourcesCount is NOT updated here;
// it should be incremented when the ingestion callback flips status to ACTIVE.
export const createKnowledgeSources = async (
  input: CreateKbArgs,
  jobIds: string[] = [],
) => {
  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({
      where: { agentId: input.agentId, organizationId: input.organizationId },
      select: { agentId: true },
    });
    if (!agent) {
      throw new BadRequestError("Agent not found in active organization");
    }

    const rows = await Promise.all(
      input.documents.map((doc, i) =>
        tx.knowledgeSource.create({
          data: {
            organizationId: input.organizationId,
            agentId: input.agentId,
            userId: input.userId,
            name: doc.name,
            originalFileName: doc.originalFileName ?? null,
            storagePath:
              doc.sourceType === "URL"
                ? (doc.url as string)
                : (doc.s3Key as string),
            sourceType: doc.sourceType,
            status: kbStatus.PROCESSING,
            ...(jobIds[i] && {
              metadata: asJsonObject(createQueuedKbMetadata(jobIds[i])),
            }),
          },
        }),
      ),
    );

    const docs = rows.map((row, i) => ({
      id: row.kbId,
      name: row.name,
      type: row.sourceType.toLowerCase(),
      url: input.documents[i]!.url ?? null,
      s3Key: input.documents[i]!.s3Key ?? null,
    }));

    return { rows, docs };
  });
};

export const listByOrg = async (args: ListKbArgs) => {
  const { organizationId, agentId } = args;
  return prisma.knowledgeSource.findMany({
    where: {
      organizationId,
      ...(agentId && { agentId }),
    },
    orderBy: { uploadedAt: "desc" },
  });
};

export const getByIdForOrg = async (kbId: string, organizationId: string) => {
  return prisma.knowledgeSource.findFirst({
    where: { kbId, organizationId },
  });
};

export const prepareKnowledgeSourceUpdate = async (input: {
  kbId: string;
  organizationId: string;
  name: string;
  agentId: string;
  storagePath: string;
  jobId?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    const source = await tx.knowledgeSource.findFirst({
      where: { kbId: input.kbId, organizationId: input.organizationId },
    });
    if (!source) return null;

    if (source.status === kbStatus.PROCESSING) {
      throw new BadRequestError(
        "Wait for document processing to finish before editing this entry",
      );
    }

    const agent = await tx.agent.findFirst({
      where: {
        agentId: input.agentId,
        organizationId: input.organizationId,
      },
      select: { agentId: true },
    });
    if (!agent) {
      throw new BadRequestError("Agent not found in active organization");
    }

    const row = await tx.knowledgeSource.update({
      where: { kbId: input.kbId },
      data: {
        name: input.name,
        agentId: input.agentId,
        storagePath: input.storagePath,
        status: kbStatus.PROCESSING,
        lastIndexedAt: null,
        errorCode: null,
        errorMessage: null,
        errorRetryable: null,
        ...(input.jobId && {
          metadata: asJsonObject(createQueuedKbMetadata(input.jobId)),
        }),
      },
    });

    if (source.agentId) {
      await syncKnowledgeSourcesCount(tx, source.agentId);
    }

    return { row, previousAgentId: source.agentId };
  });
};

// Mark KB sources as ACTIVE and derive the counter from stored rows so retries
// and worker restarts cannot inflate it.
export const markActive = async (
  kbIds: string[],
  agentId: string,
  jobId?: string,
  processorStatus?: Record<string, unknown>,
  organizationId?: string,
) => {
  if (kbIds.length === 0) return;

  return prisma.$transaction(async (tx) => {
    await tx.knowledgeSource.updateMany({
      where: {
        kbId: { in: kbIds },
        agentId,
        ...(organizationId && { organizationId }),
      },
      data: {
        status: kbStatus.ACTIVE,
        lastIndexedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        errorRetryable: null,
        ...(jobId && {
          metadata: asJsonObject(
            createCompletedKbMetadata(jobId, processorStatus),
          ),
        }),
      },
    });

    await syncKnowledgeSourcesCount(tx, agentId);
  });
};

export const markProcessing = async (
  kbIds: string[],
  jobId: string,
  options: {
    attempt?: number;
    organizationId?: string;
    processorStatus?: Record<string, unknown>;
  } = {},
) => {
  const { organizationId, ...metadataOptions } = options;
  await Promise.all(
    kbIds.map((kbId) =>
      prisma.knowledgeSource.updateMany({
        where: { kbId, ...(organizationId && { organizationId }) },
        data: {
          status: kbStatus.PROCESSING,
          lastIndexedAt: null,
          errorCode: null,
          errorMessage: null,
          errorRetryable: null,
          metadata: asJsonObject(
            createProcessingKbMetadata(jobId, {
              ...metadataOptions,
              sourceId: kbId,
            }),
          ),
        },
      }),
    ),
  );
};

export const markRetrying = async (
  kbIds: string[],
  jobId: string,
  reason: unknown,
  options: {
    attempt: number;
    maxAttempts: number;
    organizationId?: string;
  },
) => {
  await prisma.knowledgeSource.updateMany({
    where: {
      kbId: { in: kbIds },
      ...(options.organizationId && {
        organizationId: options.organizationId,
      }),
    },
    data: {
      status: kbStatus.PROCESSING,
      lastIndexedAt: null,
      errorCode: null,
      errorMessage: null,
      errorRetryable: null,
      metadata: asJsonObject(createRetryingKbMetadata(jobId, reason, options)),
    },
  });
};

const FALLBACK_PROCESSING_FAILURE: Omit<KbProcessingFailure, "kbId"> = {
  code: "KB_PROCESSING_FAILED",
  userMessage:
    "QuickVoice could not process this document. Try uploading it again. If it still fails, contact your workspace administrator.",
  retryable: true,
};

// Mark KB sources as ERROR with a user-safe reason. Raw worker exceptions must
// never be persisted because the API returns these fields to console users.
export const markError = async (
  kbIds: string[],
  reason: unknown = FALLBACK_PROCESSING_FAILURE,
  jobId = "unknown",
  organizationId?: string,
) => {
  if (kbIds.length === 0) return;

  const safeFailure = normalizeProcessingFailure(reason);
  await prisma.knowledgeSource.updateMany({
    where: {
      kbId: { in: kbIds },
      ...(organizationId && { organizationId }),
    },
    data: {
      status: kbStatus.ERROR,
      lastIndexedAt: null,
      errorCode: safeFailure.code,
      errorMessage: safeFailure.userMessage,
      errorRetryable: safeFailure.retryable,
      metadata: asJsonObject({
        ...createFailedKbMetadata(jobId, reason),
        failureReason: safeFailure.userMessage,
        retryable: safeFailure.retryable,
      }),
    },
  });
};

// Persist mixed job results atomically so one failed document does not turn
// successfully indexed documents into ERROR rows.
export const applyProcessingSummary = async (
  summary: KbProcessingSummary,
  agentId: string,
  jobId = "unknown",
  processorStatus?: Record<string, unknown>,
  organizationId?: string,
) => {
  return prisma.$transaction(async (tx) => {
    if (summary.successfulKbIds.length > 0) {
      await tx.knowledgeSource.updateMany({
        where: {
          kbId: { in: summary.successfulKbIds },
          agentId,
          ...(organizationId && { organizationId }),
        },
        data: {
          status: kbStatus.ACTIVE,
          lastIndexedAt: new Date(),
          errorCode: null,
          errorMessage: null,
          errorRetryable: null,
          metadata: asJsonObject(
            createCompletedKbMetadata(jobId, processorStatus),
          ),
        },
      });
    }

    await Promise.all(
      summary.failures.map((failure) =>
        tx.knowledgeSource.updateMany({
          where: {
            kbId: failure.kbId,
            agentId,
            ...(organizationId && { organizationId }),
          },
          data: {
            status: kbStatus.ERROR,
            lastIndexedAt: null,
            errorCode: failure.code,
            errorMessage: failure.userMessage,
            errorRetryable: failure.retryable,
            metadata: asJsonObject({
              ...createFailedKbMetadata(jobId, failure),
              failureReason: failure.userMessage,
              retryable: failure.retryable,
            }),
          },
        }),
      ),
    );

    await syncKnowledgeSourcesCount(tx, agentId);
  });
};

export const claimRetry = async (
  kbId: string,
  organizationId: string,
  metadata: Record<string, unknown>,
) => {
  const result = await prisma.knowledgeSource.updateMany({
    where: { kbId, organizationId, status: kbStatus.ERROR },
    data: {
      status: kbStatus.PROCESSING,
      lastIndexedAt: null,
      errorCode: null,
      errorMessage: null,
      errorRetryable: null,
      metadata: asJsonObject(metadata),
    },
  });
  return result.count === 1;
};

// Hard delete and synchronize the owning agent's count from remaining rows.
// External asset cleanup is handled by kb.service.ts before this DB delete.
export const deleteKnowledgeSource = async (
  kbId: string,
  organizationId: string,
) => {
  return prisma.$transaction(async (tx) => {
    // Tenant-safe fetch — ensures the row belongs to this org.
    const row = await tx.knowledgeSource.findFirst({
      where: { kbId, organizationId },
    });
    if (!row) return null;

    await tx.knowledgeSource.delete({ where: { kbId } });

    if (row.agentId) {
      await syncKnowledgeSourcesCount(tx, row.agentId);
    }

    return row;
  });
};

async function syncKnowledgeSourcesCount(
  tx: Prisma.TransactionClient,
  agentId: string,
) {
  const count = await tx.knowledgeSource.count({
    where: { agentId, status: kbStatus.ACTIVE },
  });
  await tx.agent.update({
    where: { agentId },
    data: { knowledgeSourcesCount: count },
  });
}

function asJsonObject(value: Record<string, unknown>) {
  return value as Prisma.InputJsonObject;
}

function normalizeProcessingFailure(
  reason: unknown,
): Omit<KbProcessingFailure, "kbId"> {
  if (!reason || typeof reason !== "object" || Array.isArray(reason)) {
    return {
      ...FALLBACK_PROCESSING_FAILURE,
      ...(typeof reason === "string" && reason.trim()
        ? { userMessage: sanitizeKbFailureReason(reason) }
        : {}),
    };
  }

  const record = reason as Record<string, unknown>;
  const code =
    typeof record.code === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(record.code)
      ? record.code
      : FALLBACK_PROCESSING_FAILURE.code;
  const userMessage =
    typeof record.userMessage === "string" && record.userMessage.trim()
      ? sanitizeKbFailureReason(record.userMessage)
      : FALLBACK_PROCESSING_FAILURE.userMessage;
  const retryable =
    typeof record.retryable === "boolean"
      ? record.retryable
      : FALLBACK_PROCESSING_FAILURE.retryable;

  return { code, userMessage, retryable };
}
