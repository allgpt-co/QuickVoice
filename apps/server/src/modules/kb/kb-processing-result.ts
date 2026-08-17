import { sanitizeKbFailureReason } from "./kb-job-metadata.js";

type KbProcessingItem = {
  kbId?: unknown;
  status?: unknown;
  code?: unknown;
  error?: unknown;
  userMessage?: unknown;
  retryable?: unknown;
};

type KbProcessingResponse = {
  success?: unknown;
  processed?: unknown;
  documents?: unknown;
};

export type KbProcessingFailure = {
  kbId: string;
  code: string;
  userMessage: string;
  retryable: boolean;
};

export type KbProcessingSummary = {
  successfulKbIds: string[];
  failures: KbProcessingFailure[];
};

export class KbProcessingFailedError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly summary: KbProcessingSummary,
  ) {
    super(message);
    this.retryable = summary.failures.some((failure) => failure.retryable);
    this.name = this.retryable
      ? "KbProcessingFailedError"
      : "UnrecoverableError";
  }
}

function processingItemsFromResponse(body: KbProcessingResponse) {
  if (body?.success === true && Array.isArray(body.processed)) {
    return body.processed as KbProcessingItem[];
  }

  if (Array.isArray(body?.documents)) {
    return body.documents as KbProcessingItem[];
  }

  throw new Error("KB processing returned an invalid response body");
}

export function summarizeKbProcessing(
  body: KbProcessingResponse,
  expectedKbIds: string[],
): KbProcessingSummary {
  const processed = processingItemsFromResponse(body);
  const processedIds = new Set(
    processed
      .map((item) => (typeof item.kbId === "string" ? item.kbId : null))
      .filter((kbId): kbId is string => kbId !== null),
  );
  const missingIds = expectedKbIds.filter((kbId) => !processedIds.has(kbId));
  const successfulKbIds = processed
    .filter((item) => item.status === "ok" && typeof item.kbId === "string")
    .map((item) => item.kbId as string);
  const failures = processed
    .filter((item) => item.status !== "ok")
    .map(toFailure);

  for (const kbId of missingIds) {
    failures.push({
      kbId,
      code: "KB_PROCESSING_RESULT_MISSING",
      userMessage:
        "QuickVoice did not receive a processing result for this document. Try uploading it again.",
      retryable: true,
    });
  }

  return { successfulKbIds, failures };
}

export function assertKbProcessingSucceeded(
  body: KbProcessingResponse,
  expectedKbIds: string[],
) {
  const summary = summarizeKbProcessing(body, expectedKbIds);
  if (summary.failures.length === 0) {
    return summary;
  }

  const details = summary.failures
    .map((failure) => `${failure.kbId}: ${failure.userMessage}`)
    .join("; ");
  throw new KbProcessingFailedError(
    `KB processing failed: ${details}`,
    summary,
  );
}

function toFailure(item: KbProcessingItem): KbProcessingFailure {
  return {
    kbId: typeof item.kbId === "string" ? item.kbId : "unknown",
    code:
      typeof item.code === "string" && item.code.length > 0
        ? item.code
        : "KB_PROCESSING_FAILED",
    userMessage: sanitizeKbFailureReason(
      typeof item.userMessage === "string" && item.userMessage.length > 0
        ? item.userMessage
        : typeof item.error === "string" && item.error.length > 0
          ? item.error
          : "QuickVoice could not process this knowledge source. Try again later.",
    ),
    retryable: item.retryable !== false,
  };
}
