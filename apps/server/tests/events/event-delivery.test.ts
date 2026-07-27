import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildReplayDelivery,
  canonicalEventBytes,
  nextDeliveryAttempt,
  redactEventPayload,
  signEventDelivery,
  validateEventSubscription,
  verifyEventSignature,
  type EventEnvelope,
} from "../../src/modules/events/event-delivery.js";

const event: EventEnvelope = {
  eventId: "evt_1",
  type: "call.completed",
  schemaVersion: "2026-07-01",
  organizationId: "org_1",
  occurredAt: "2026-07-26T10:00:00.000Z",
  createdAt: "2026-07-26T10:00:01.000Z",
  resource: { type: "call", id: "call_1" },
  payload: { status: "completed" },
};

test("event signatures verify exact canonical bytes with timestamp tolerance", () => {
  const body = canonicalEventBytes(event);
  const signature = signEventDelivery({ deliveryId: "del_1", timestamp: 1000, body, secret: "secret" });

  assert.equal(verifyEventSignature({ deliveryId: "del_1", timestamp: 1000, body, secret: "secret", signatureHeader: signature, now: 1001 }), true);
  assert.equal(verifyEventSignature({ deliveryId: "del_1", timestamp: 1000, body: Buffer.from(`${body}tampered`), secret: "secret", signatureHeader: signature, now: 1001 }), false);
  assert.equal(verifyEventSignature({ deliveryId: "del_1", timestamp: 1000, body, secret: "secret", signatureHeader: signature, now: 2000 }), false);
});

test("event subscriptions reject unsafe endpoints and empty filters", () => {
  assert.deepEqual(validateEventSubscription({ subscriptionId: "sub_1", organizationId: "org_1", endpoint: "https://hooks.example.com/qv", enabled: true, eventTypes: ["call.completed"], payloadVersion: "2026-07-01", secretVersionId: "sec_1" }), []);
  assert.deepEqual(validateEventSubscription({ subscriptionId: "sub_1", organizationId: "org_1", endpoint: "http://127.0.0.1/hook", enabled: true, eventTypes: [], payloadVersion: "2026-07-01", secretVersionId: "sec_1" }), ["endpoint must use https", "endpoint host is private or link-local", "subscription requires at least one event type"]);
});

test("delivery retry policy separates transient retries from permanent dead-letter outcomes", () => {
  assert.equal(nextDeliveryAttempt({ attempt: 1, maxAttempts: 5, statusCode: 500 }).state, "retry_scheduled");
  assert.equal(nextDeliveryAttempt({ attempt: 5, maxAttempts: 5, statusCode: 500 }).state, "dead_letter");
  assert.equal(nextDeliveryAttempt({ attempt: 1, maxAttempts: 5, statusCode: 400 }).state, "dead_letter");
  assert.equal(nextDeliveryAttempt({ attempt: 1, maxAttempts: 5, statusCode: 429, retryAfterMs: 3000 }).nextRetryDelayMs, 3000);
});

test("event payload redaction removes sensitive fields before logging attempts", () => {
  assert.deepEqual(redactEventPayload({ status: "completed", callerPhone: "+15550101000", nested: { authToken: "abc", safe: "ok" } }), {
    status: "completed",
    callerPhone: "[redacted]",
    nested: { authToken: "[redacted]", safe: "ok" },
  });
});

test("replay deliveries preserve original event ID, body, and schema version", () => {
  const replay = buildReplayDelivery(event, { subscriptionId: "sub_1", organizationId: "org_1", endpoint: "https://hooks.example.com/qv", enabled: true, eventTypes: ["call.completed"], payloadVersion: "2026-07-01", secretVersionId: "sec_1" });

  assert.equal(replay.eventId, "evt_1");
  assert.equal(replay.payloadVersion, event.schemaVersion);
  assert.equal(replay.body.toString(), canonicalEventBytes(event).toString());
  assert.equal(replay.replayed, true);
});
