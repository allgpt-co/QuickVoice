import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { generateDownloadUrl } from "../config/s3.js";
import {
  deleteKbDocumentVectors,
  processKbDocuments,
} from "../modules/kb/kb-processing-client.js";
import {
  assertKbProcessingSucceeded,
  KbProcessingFailedError,
} from "../modules/kb/kb-processing-result.js";
import { isFinalKbJobAttempt } from "../modules/kb/kb-job-metadata.js";
import * as kbRepository from "../modules/kb/kb.repository.js";
import { safeKbWorkerFailure } from "../modules/kb/kb-worker-failure.js";
import type { KbJobData, KbJobName } from "../queues/kb.queue.js";

const AI_API_URL = process.env.AI_API_URL ?? "http://localhost:5555";
const KB_PROCESSING_POLL_INTERVAL_MS = numberFromEnv(
  "KB_PROCESSING_POLL_INTERVAL_MS",
  2_000,
);
const KB_PROCESSING_TIMEOUT_MS = numberFromEnv(
  "KB_PROCESSING_TIMEOUT_MS",
  10 * 60 * 1_000,
);

export const kbWorker = new Worker<KbJobData, void, KbJobName>(
  "kb-ingest",
  async (job) => {
    const {
      kbIds,
      agentId,
      organizationId,
      documents,
      replaceExisting,
      previousAgentId,
    } = job.data;
    const jobId = job.id ?? "unknown";
    await kbRepository.markProcessing(kbIds, jobId, {
      attempt: job.attemptsMade + 1,
      organizationId,
    });

    const internalApiKey = process.env.INTERNAL_API_KEY?.trim();
    if (!internalApiKey) {
      throw new Error("INTERNAL_API_KEY is required for KB processing");
    }

    // Edited sources must remove their earlier vectors first. This also clears
    // the old namespace when the source is reassigned to another agent.
    if (replaceExisting) {
      const namespaceToReplace = previousAgentId ?? agentId;
      await Promise.all(
        kbIds.map((kbId) =>
          deleteKbDocumentVectors({
            aiApiUrl: AI_API_URL,
            internalApiKey,
            agentId: namespaceToReplace,
            kbId,
          }),
        ),
      );
    }

    // 1. Generate presigned download URLs for S3-backed documents
    const enriched = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        presignedUrl: doc.s3Key
          ? await generateDownloadUrl(doc.s3Key)
          : undefined,
      })),
    );

    // 2. Call the apps/ai FastAPI processing endpoint and wait for async jobs.
    const body = await processKbDocuments({
      aiApiUrl: AI_API_URL,
      internalApiKey,
      payload: { agentId, organizationId, documents: enriched },
      pollIntervalMs: KB_PROCESSING_POLL_INTERVAL_MS,
      timeoutMs: KB_PROCESSING_TIMEOUT_MS,
      onStatus: (processorStatus) =>
        kbRepository.markProcessing(kbIds, jobId, {
          organizationId,
          processorStatus,
        }),
    });
    assertKbProcessingSucceeded(body, kbIds);

    // 3. Mark all sources as ACTIVE and clear earlier retry diagnostics.
    await kbRepository.markActive(kbIds, agentId, jobId, body, organizationId);
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

kbWorker.on("failed", async (job, err) => {
  if (!job) return;
  const { kbIds, agentId, organizationId } = job.data;
  const jobId = job.id ?? "unknown";
  const maxAttempts = Math.max(1, job.opts.attempts ?? 1);

  if (!isFinalKbJobAttempt(job, err)) {
    console.warn(
      `[kb-worker] job ${jobId} attempt ${job.attemptsMade} of ${maxAttempts} failed`,
      err.message,
    );
    await kbRepository
      .markRetrying(kbIds, jobId, err, {
        attempt: job.attemptsMade,
        maxAttempts,
        organizationId,
      })
      .catch((error) =>
        console.error("[kb-worker] markRetrying failed", error),
      );
    return;
  }

  console.error(`[kb-worker] job ${jobId} failed permanently`, err.message);
  const persistFailure =
    err instanceof KbProcessingFailedError
      ? kbRepository.applyProcessingSummary(
          err.summary,
          agentId,
          jobId,
          undefined,
          organizationId,
        )
      : kbRepository.markError(
          kbIds,
          safeKbWorkerFailure(err),
          jobId,
          organizationId,
        );

  await persistFailure.catch((error) =>
    console.error("[kb-worker] persisting processing failure failed", error),
  );
});

kbWorker.on("completed", (job) => {
  console.log(`[kb-worker] job ${job.id} completed`);
});

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
