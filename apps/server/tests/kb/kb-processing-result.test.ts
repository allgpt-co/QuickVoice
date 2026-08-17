import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertKbProcessingSucceeded,
  KbProcessingFailedError,
  summarizeKbProcessing,
} from "../../src/modules/kb/kb-processing-result.js";

test("assertKbProcessingSucceeded accepts successful per-document results", () => {
  assert.doesNotThrow(() =>
    assertKbProcessingSucceeded(
      {
        success: true,
        processed: [
          { kbId: "kb_1", status: "ok" },
          { kbId: "kb_2", status: "ok" },
        ],
      },
      ["kb_1", "kb_2"],
    ),
  );
});

test("assertKbProcessingSucceeded accepts successful async job document results", () => {
  assert.doesNotThrow(() =>
    assertKbProcessingSucceeded(
      {
        jobId: "kbjob_123",
        status: "succeeded",
        documents: [
          { kbId: "kb_1", status: "ok" },
          { kbId: "kb_2", status: "ok" },
        ],
      },
      ["kb_1", "kb_2"],
    ),
  );
});

test("assertKbProcessingSucceeded rejects per-document failures in a 200 response", () => {
  assert.throws(
    () =>
      assertKbProcessingSucceeded(
        {
          success: true,
          processed: [
            { kbId: "kb_1", status: "ok" },
            {
              kbId: "kb_2",
              status: "error",
              error: "PINECONE_API_KEY missing",
            },
          ],
        },
        ["kb_1", "kb_2"],
      ),
    /KB processing failed: kb_2: PINECONE_API_KEY missing/,
  );
});

test("assertKbProcessingSucceeded rejects missing document results", () => {
  assert.throws(
    () =>
      assertKbProcessingSucceeded(
        {
          success: true,
          processed: [{ kbId: "kb_1", status: "ok" }],
        },
        ["kb_1", "kb_2"],
      ),
    /did not receive a processing result for this document/,
  );
});

test("summarizeKbProcessing preserves user-safe error details for persistence", () => {
  const summary = summarizeKbProcessing(
    {
      status: "failed",
      documents: [
        {
          kbId: "kb_1",
          status: "error",
          code: "KB_EMPTY_TEXT",
          userMessage: "No readable text was found in this knowledge source.",
          error: "raw parser stack that must not reach the UI",
          retryable: false,
        },
      ],
    },
    ["kb_1"],
  );

  assert.deepEqual(summary, {
    successfulKbIds: [],
    failures: [
      {
        kbId: "kb_1",
        code: "KB_EMPTY_TEXT",
        userMessage: "No readable text was found in this knowledge source.",
        retryable: false,
      },
    ],
  });
});

test("assertKbProcessingSucceeded exposes mixed results without leaking raw errors", () => {
  assert.throws(
    () =>
      assertKbProcessingSucceeded(
        {
          status: "partial_failed",
          documents: [
            { kbId: "kb_ok", status: "ok" },
            {
              kbId: "kb_failed",
              status: "error",
              code: "KB_EMPTY_TEXT",
              userMessage:
                "No readable text was found in this knowledge source.",
              error: "sensitive raw parser detail",
              retryable: false,
            },
          ],
        },
        ["kb_ok", "kb_failed"],
      ),
    (error) => {
      assert.ok(error instanceof KbProcessingFailedError);
      assert.deepEqual(error.summary.successfulKbIds, ["kb_ok"]);
      assert.equal(error.summary.failures[0]?.code, "KB_EMPTY_TEXT");
      assert.doesNotMatch(error.message, /sensitive raw parser detail/);
      return true;
    },
  );
});

test("summarizeKbProcessing creates an actionable failure for a missing result", () => {
  const summary = summarizeKbProcessing(
    {
      success: true,
      processed: [{ kbId: "kb_1", status: "ok" }],
    },
    ["kb_1", "kb_2"],
  );

  assert.equal(summary.failures[0]?.kbId, "kb_2");
  assert.equal(summary.failures[0]?.code, "KB_PROCESSING_RESULT_MISSING");
  assert.equal(summary.failures[0]?.retryable, true);
  assert.match(summary.failures[0]?.userMessage ?? "", /uploading it again/i);
});

test("assertKbProcessingSucceeded marks permanent document failures unrecoverable", () => {
  let error: (Error & { retryable?: boolean }) | undefined;
  try {
    assertKbProcessingSucceeded(
      {
        documents: [
          {
            kbId: "kb_1",
            status: "error",
            error: "Parser details",
            userMessage: "Upload a readable document.",
            retryable: false,
          },
        ],
      },
      ["kb_1"],
    );
  } catch (caught) {
    error = caught as Error & { retryable?: boolean };
  }

  assert.equal(error?.name, "UnrecoverableError");
  assert.equal(error?.retryable, false);
  assert.match(error?.message ?? "", /Upload a readable document/);
  assert.doesNotMatch(error?.message ?? "", /Parser details/);
});
