import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSupportBundleManifest,
  classifyReadinessCheck,
  redactSupportBundleContent,
} from "../../src/modules/operations/diagnostics.js";

test("readiness classification separates missing optional providers from outages", () => {
  const checkedAt = new Date("2026-07-26T10:00:00.000Z");

  assert.deepEqual(classifyReadinessCheck({ component: "db", status: "ok", checkedAt }), {
    component: "db",
    state: "healthy",
    impact: "none",
    checkedAt,
    staleAfterSeconds: 60,
    source: "readiness",
  });
  assert.equal(
    classifyReadinessCheck({ component: "stripe", status: "not_configured", optional: true }).impact,
    "none",
  );
  assert.equal(
    classifyReadinessCheck({ component: "redis", status: "error", message: "rate limit exceeded" }).state,
    "rate_limited",
  );
});

test("support bundle redaction strips credentials, signed urls, phone numbers, prompts, transcripts, and tool payloads", () => {
  const redacted = redactSupportBundleContent(
    'authorization: Bearer abc.def\napiKey=secret-value\nhttps://bucket.example/file.wav?X-Amz-Signature=abc123\n+1 (555) 010-1000\ntranscript="real caller words"\nprompt="system prompt"\ntoolPayload="raw body"',
  );

  assert.doesNotMatch(redacted, /abc\.def|secret-value|X-Amz-Signature=abc123|555\) 010|real caller words|system prompt|raw body/);
  assert.match(redacted, /\[redacted phone\]/);
  assert.match(redacted, /transcript: \[redacted content\]/);
});

test("support bundle manifest reports checksums, redaction, size, and expiry", () => {
  const manifest = buildSupportBundleManifest({
    expiresAt: new Date("2026-07-27T10:00:00.000Z"),
    files: [
      { path: "server.log", content: "authorization=secret-token" },
      { path: "readiness.json", content: "{\"ready\":true}" },
    ],
  });

  assert.equal(manifest.expiresAt, "2026-07-27T10:00:00.000Z");
  assert.equal(manifest.files.length, 2);
  assert.equal(manifest.files[0].redacted, true);
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.totalBytes > 0);
});
