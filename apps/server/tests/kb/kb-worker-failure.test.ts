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

test("AI HTTP authentication failures identify internal key mismatch", () => {
  for (const status of [401, 403]) {
    const failure = safeKbWorkerFailure(
      new Error(`KB processing failed with HTTP ${status}`),
    );
    assert.equal(failure.code, "KB_INTERNAL_AUTH_MISMATCH");
    assert.match(failure.userMessage, /INTERNAL_API_KEY parity/i);
  }
});

test("AI HTTP 503 failures identify service unavailability", () => {
  const failure = safeKbWorkerFailure(
    new Error("KB processing failed with HTTP 503"),
  );
  assert.equal(failure.code, "KB_AI_SERVICE_UNAVAILABLE");
});

test("AI connection failures identify an unreachable service", () => {
  for (const error of [
    new TypeError("fetch failed"),
    new Error("connect ECONNREFUSED 127.0.0.1:5555"),
    new Error("getaddrinfo ENOTFOUND ai"),
  ]) {
    const failure = safeKbWorkerFailure(error);
    assert.equal(failure.code, "KB_AI_SERVICE_UNREACHABLE");
    assert.match(failure.userMessage, /AI_API_URL/i);
  }
});
