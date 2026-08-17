import assert from "node:assert/strict";
import { test } from "node:test";

import { legacyTransitionAction } from "../../src/modules/billing/legacy-subscription-transition.service.js";

const NOW = new Date("2026-08-01T00:00:00.000Z");

test("paid non-dunning legacy entitlement ends at its paid boundary", () => {
  assert.equal(
    legacyTransitionAction("active", new Date("2026-08-15T00:00:00.000Z"), NOW),
    "period_end",
  );
  assert.equal(legacyTransitionAction("trialing", null, NOW), "period_end");
});

test("dunning or expired legacy subscriptions cancel immediately", () => {
  for (const status of ["past_due", "unpaid", "incomplete"]) {
    assert.equal(
      legacyTransitionAction(status, new Date("2026-08-15T00:00:00.000Z"), NOW),
      "immediate",
    );
  }
  assert.equal(
    legacyTransitionAction("active", new Date("2026-07-31T23:59:59.000Z"), NOW),
    "immediate",
  );
});
