import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasExhaustedKbAttempts,
  safeKbWorkerFailure,
} from "../../src/modules/kb/kb-worker-failure.js";

test("a retried KB job is not final until every configured attempt is used", () => {
  assert.equal(hasExhaustedKbAttempts(1, 3), false);
  assert.equal(hasExhaustedKbAttempts(2, 3), false);
  assert.equal(hasExhaustedKbAttempts(3, 3), true);
  assert.equal(hasExhaustedKbAttempts(1, undefined), true);
});

test("worker failures are converted to safe actionable messages", () => {
  const timeout = safeKbWorkerFailure(
    new Error("KB processing job abc did not complete within 5000ms"),
  );
  assert.equal(timeout.code, "KB_PROCESSING_TIMEOUT");
  assert.match(timeout.userMessage, /split it into smaller files/i);

  const unknown = safeKbWorkerFailure(
    new Error("postgresql://user:secret@private-host internal stack"),
  );
  assert.equal(unknown.code, "KB_PROCESSING_UNAVAILABLE");
  assert.doesNotMatch(unknown.userMessage, /secret|private-host|postgresql/i);
});
