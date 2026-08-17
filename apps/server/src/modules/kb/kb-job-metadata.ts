import { redactText } from "../../lib/redaction.js";

const MAX_FAILURE_REASON_LENGTH = 500;
const MAX_METADATA_TEXT_LENGTH = 120;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(authorization|api[-_]?key|token|secret|password|credential)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;
const BEARER_TOKEN_PATTERN = /\bbearer\s+[^\s,;]+/gi;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:api[-_]?key|token|secret|password|credential|signature)=)[^&\s]+/gi;

type ProcessorStatus = {
  jobId?: unknown;
  status?: unknown;
  stage?: unknown;
  progress?: unknown;
  documents?: unknown;
};

type JobAttempt = {
  attemptsMade: number;
  opts: { attempts?: number };
};

export function createQueuedKbMetadata(
  jobId: string,
  options: {
    now?: Date;
    retryCount?: number;
    retryOfJobId?: string | null;
  } = {},
) {
  const metadata: Record<string, unknown> = {
    jobId,
    stage: "queued",
    progress: { processed: 0, total: 1, percent: 0 },
    queuedAt: (options.now ?? new Date()).toISOString(),
  };

  if (options.retryCount && options.retryCount > 0) {
    metadata.retryCount = options.retryCount;
  }
  if (options.retryOfJobId) {
    metadata.retryOfJobId = options.retryOfJobId;
  }

  return metadata;
}

export function createProcessingKbMetadata(
  jobId: string,
  options: {
    attempt?: number;
    now?: Date;
    processorStatus?: ProcessorStatus;
    sourceId?: string;
  } = {},
) {
  const status = options.processorStatus;
  const documentStatus = findDocumentStatus(
    status?.documents,
    options.sourceId,
  );
  const processorJobId = safeMetadataText(status?.jobId);
  const stage =
    safeMetadataText(documentStatus?.stage) ??
    safeMetadataText(status?.stage) ??
    safeMetadataText(status?.status) ??
    "processing";
  const metadata: Record<string, unknown> = {
    jobId,
    stage,
    progress: normalizeProgress(status?.progress),
    updatedAt: (options.now ?? new Date()).toISOString(),
  };

  if (processorJobId) metadata.processorJobId = processorJobId;
  if (options.attempt && options.attempt > 0) {
    metadata.attempt = options.attempt;
  }
  if (typeof documentStatus?.retryable === "boolean") {
    metadata.retryable = documentStatus.retryable;
  }

  return metadata;
}

export function createRetryingKbMetadata(
  jobId: string,
  reason: unknown,
  options: {
    attempt: number;
    maxAttempts: number;
    now?: Date;
  },
) {
  return {
    jobId,
    stage: "retrying",
    attempt: options.attempt,
    maxAttempts: options.maxAttempts,
    failureReason: sanitizeKbFailureReason(reason),
    retryable: true,
    updatedAt: (options.now ?? new Date()).toISOString(),
  };
}

export function createCompletedKbMetadata(
  jobId: string,
  processorStatus?: ProcessorStatus,
  now = new Date(),
) {
  const processorJobId = safeMetadataText(processorStatus?.jobId);
  const metadata: Record<string, unknown> = {
    jobId,
    stage: "completed",
    progress: normalizeProgress(processorStatus?.progress, 100),
    completedAt: now.toISOString(),
  };

  if (processorJobId) metadata.processorJobId = processorJobId;
  return metadata;
}

export function createFailedKbMetadata(
  jobId: string,
  reason: unknown,
  now = new Date(),
) {
  return {
    jobId,
    stage: "failed",
    failureReason: sanitizeKbFailureReason(reason),
    retryable: failureIsRetryable(reason),
    failedAt: now.toISOString(),
  };
}

export function sanitizeKbFailureReason(reason: unknown) {
  const fallback =
    "Knowledge-base processing failed. Retry the document or contact support if the problem continues.";
  const raw =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
        ? reason.message
        : "";
  const sanitized = redactText(raw)
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]")
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(SENSITIVE_QUERY_PATTERN, "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) return fallback;
  if (sanitized.length <= MAX_FAILURE_REASON_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_FAILURE_REASON_LENGTH - 3).trimEnd()}...`;
}

export function isFinalKbJobAttempt(
  job: JobAttempt,
  error?: { name?: string },
) {
  if (error?.name === "UnrecoverableError") return true;
  const maxAttempts = Math.max(1, job.opts.attempts ?? 1);
  return job.attemptsMade >= maxAttempts;
}

function normalizeProgress(value: unknown, fallbackPercent = 0) {
  if (!isRecord(value)) {
    return fallbackPercent > 0
      ? { processed: 1, total: 1, percent: fallbackPercent }
      : { processed: 0, total: 1, percent: 0 };
  }
  const progress = isRecord(value) ? value : {};
  const total = safeNonNegativeNumber(progress.total, 1);
  const processed = Math.min(
    safeNonNegativeNumber(progress.processed, 0),
    total,
  );
  const percent = Math.min(
    100,
    safeNonNegativeNumber(
      progress.percent,
      total > 0 ? Math.round((processed / total) * 100) : fallbackPercent,
    ),
  );

  return { processed, total, percent };
}

function findDocumentStatus(value: unknown, sourceId?: string) {
  if (!sourceId || !Array.isArray(value)) return null;
  const match = value.find((item) => isRecord(item) && item.kbId === sourceId);
  return isRecord(match) ? match : null;
}

function safeMetadataText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_METADATA_TEXT_LENGTH);
}

function safeNonNegativeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failureIsRetryable(reason: unknown) {
  return !(
    isRecord(reason) &&
    typeof reason.retryable === "boolean" &&
    reason.retryable === false
  );
}
