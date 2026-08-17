import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCompletedKbMetadata,
  createProcessingKbMetadata,
  createQueuedKbMetadata,
  isFinalKbJobAttempt,
  sanitizeKbFailureReason,
} from "../../src/modules/kb/kb-job-metadata.js";

const NOW = new Date("2026-07-26T12:00:00.000Z");

test("KB job metadata exposes stable queue and processor progress", () => {
  assert.deepEqual(
    createQueuedKbMetadata("kb-job-1", {
      now: NOW,
      retryCount: 2,
      retryOfJobId: "kb-job-0",
    }),
    {
      jobId: "kb-job-1",
      stage: "queued",
      progress: { processed: 0, total: 1, percent: 0 },
      queuedAt: NOW.toISOString(),
      retryCount: 2,
      retryOfJobId: "kb-job-0",
    },
  );

  assert.deepEqual(
    createProcessingKbMetadata("kb-job-1", {
      now: NOW,
      sourceId: "kb-source-1",
      processorStatus: {
        jobId: "processor-job-1",
        stage: "processing",
        progress: { processed: 1, total: 4, percent: 25 },
        documents: [
          {
            kbId: "kb-source-1",
            stage: "embedding",
            retryable: true,
          },
        ],
      },
    }),
    {
      jobId: "kb-job-1",
      processorJobId: "processor-job-1",
      stage: "embedding",
      progress: { processed: 1, total: 4, percent: 25 },
      retryable: true,
      updatedAt: NOW.toISOString(),
    },
  );

  assert.deepEqual(createCompletedKbMetadata("kb-job-1", undefined, NOW), {
    jobId: "kb-job-1",
    stage: "completed",
    progress: { processed: 1, total: 1, percent: 100 },
    completedAt: NOW.toISOString(),
  });
});

test("KB failure reasons redact credentials and PII before storage", () => {
  const reason = sanitizeKbFailureReason(
    "Authorization: Bearer private-token; api_key=secret-value for person@example.com",
  );

  assert.doesNotMatch(reason, /private-token|secret-value|person@example\.com/);
  assert.match(reason, /\[REDACTED\]/);
  assert.match(reason, /\[REDACTED_EMAIL\]/);
});

test("BullMQ jobs remain processing until their configured attempts are exhausted", () => {
  assert.equal(
    isFinalKbJobAttempt({ attemptsMade: 1, opts: { attempts: 3 } }),
    false,
  );
  assert.equal(
    isFinalKbJobAttempt({ attemptsMade: 3, opts: { attempts: 3 } }),
    true,
  );
  assert.equal(isFinalKbJobAttempt({ attemptsMade: 1, opts: {} }), true);
  assert.equal(
    isFinalKbJobAttempt(
      { attemptsMade: 1, opts: { attempts: 3 } },
      { name: "UnrecoverableError" },
    ),
    true,
  );
});
