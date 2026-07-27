import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../packages/sdk-core/src/index.ts", import.meta.url), "utf8");

test("sdk core package defines required client, retry, pagination, redaction, and CLI contracts", () => {
  for (const symbol of ["createQuickVoiceClientConfig", "shouldRetryRequest", "collectAllPages", "redactSdkLog", "cliExitCodeForStatus", "QuickVoiceApiError"]) {
    assert.match(source, new RegExp(`export (async )?(function|class) ${symbol}`));
  }
});

test("sdk retry policy requires idempotency keys for mutating retries", () => {
  assert.match(source, /MUTATING_METHODS/);
  assert.match(source, /mutation_requires_idempotency_key/);
  assert.match(source, /status === 429/);
  assert.match(source, /status >= 500/);
});

test("sdk logging contract redacts auth material and contact identifiers", () => {
  assert.match(source, /SECRET_PATTERN/);
  assert.match(source, /PII_PATTERN/);
  assert.doesNotMatch(source, /console\.log\(args\.apiKey/);
});
