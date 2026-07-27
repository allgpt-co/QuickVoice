import { test } from "node:test";
import assert from "node:assert/strict";

import {
  actionNeedsAcknowledgement,
  buildNotificationDeduplicationKey,
  canReviewerDecide,
  redactConfigDiff,
  resolveReviewStatus,
} from "../../src/modules/collaboration/collaboration-policy.js";

test("review policy enforces two-person approval separation when required", () => {
  assert.equal(canReviewerDecide({ authorUserId: "user_a", reviewerUserId: "user_a" }), false);
  assert.equal(canReviewerDecide({ authorUserId: "user_a", reviewerUserId: "user_b" }), true);
  assert.equal(
    canReviewerDecide({ authorUserId: "user_a", reviewerUserId: "user_a", authorSeparationRequired: false }),
    true,
  );
});

test("review status expires pending reviews without rewriting terminal decisions", () => {
  const now = new Date("2026-07-26T10:00:00.000Z");

  assert.equal(resolveReviewStatus({ status: "pending", expiresAt: "2026-07-26T09:59:00.000Z", now }), "expired");
  assert.equal(resolveReviewStatus({ status: "pending", expiresAt: "2026-07-26T10:01:00.000Z", now }), "pending");
  assert.equal(resolveReviewStatus({ status: "approved", expiresAt: "2026-07-26T09:59:00.000Z", now }), "approved");
});

test("configuration diffs redact secret-like fields while keeping safe semantic changes", () => {
  const diff = redactConfigDiff(
    { prompt: "Hello", credentials: { apiKey: "old-secret" }, voice: "alloy" },
    { prompt: "Hello there", credentials: { apiKey: "new-secret" }, voice: "alloy" },
  );

  assert.deepEqual(diff, [
    { path: "credentials.apiKey", before: "[redacted]", after: "[redacted]", redacted: true },
    { path: "prompt", before: "Hello", after: "Hello there", redacted: false },
  ]);
});

test("notification helpers identify acknowledgement and idempotent delivery keys", () => {
  assert.equal(actionNeedsAcknowledgement("review_requested"), true);
  assert.equal(actionNeedsAcknowledgement("comment_created"), false);
  assert.equal(
    buildNotificationDeduplicationKey({ eventId: "evt_1", recipientUserId: "user_1", channel: "in_app" }),
    "evt_1:user_1:in_app",
  );
});
