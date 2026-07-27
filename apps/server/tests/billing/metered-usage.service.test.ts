import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCallMeterEvent } from "../../src/modules/billing/metered-usage.service.js";

test("call meter events use stable provider and request idempotency identifiers", () => {
  const event = buildCallMeterEvent(
    {
      organizationId: "org_123",
      callId: "call_123",
      durationSeconds: 61,
      timestamp: new Date("2026-07-03T12:01:00Z"),
    },
    "quickvoice_call_minutes",
    "cus_123",
  );

  assert.equal(event.params.identifier, "call:call_123");
  assert.equal(event.requestOptions.idempotencyKey, "quickvoice-call:call_123");
  assert.equal(event.params.payload.value, "2");
  assert.equal(event.params.payload.stripe_customer_id, "cus_123");
  assert.equal(event.billableMinutes, 2);
});
