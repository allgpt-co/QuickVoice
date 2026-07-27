import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDerivedSignal,
  normalizeTranscriptSearchQuery,
  redactSearchSnippet,
} from "../../src/modules/intelligence/search-contract.js";

test("transcript search query normalizes phrases, excludes, and bounded pagination", () => {
  const query = normalizeTranscriptSearchQuery({
    organizationId: "org_1",
    mode: "keyword",
    text: " appointment ",
    phrases: ["billing issue", "billing issue", ""],
    excludes: [" spam ", "spam"],
    filters: { direction: "inbound", language: "en-US" },
    limit: 500,
  });

  assert.deepEqual(query, {
    organizationId: "org_1",
    mode: "keyword",
    text: "appointment",
    phrases: ["billing issue"],
    excludes: ["spam"],
    filters: { direction: "inbound", language: "en-US" },
    limit: 100,
  });
});

test("keyword transcript search requires searchable text or phrase filters", () => {
  assert.throws(
    () => normalizeTranscriptSearchQuery({ organizationId: "org_1", mode: "keyword", filters: {} }),
    /requires text or phrase/,
  );
});

test("search snippets redact contact and secret-like values", () => {
  const snippet = redactSearchSnippet("Call +1 (555) 010-1000, email caller@example.com, apiKey=abc123");

  assert.doesNotMatch(snippet, /555|caller@example\.com|abc123/);
  assert.match(snippet, /\[redacted phone\]/);
  assert.match(snippet, /\[redacted email\]/);
  assert.match(snippet, /apiKey=\[redacted\]/);
});

test("derived intelligence signals require provenance, confidence, and model versions", () => {
  const signal = buildDerivedSignal({
    signalId: "sig_1",
    organizationId: "org_1",
    callId: "call_1",
    kind: "sentiment",
    value: "negative",
    confidence: 0.72,
    modelVersion: "model_v1",
    promptVersion: "prompt_v1",
    processingMs: 230,
    sourceTurns: [{ turnId: "turn_1", startMs: 1000, endMs: 2500 }],
    status: "ready",
  });

  assert.equal(signal.confidence, 0.72);
  assert.throws(() => buildDerivedSignal({ ...signal, confidence: 1.5 }), /between 0 and 1/);
  assert.throws(() => buildDerivedSignal({ ...signal, sourceTurns: [] }), /source turns/);
});
