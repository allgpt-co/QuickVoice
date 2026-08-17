import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateReadiness } from "../../src/modules/system/readiness-policy.js";

test("readiness requires core data and secret boundaries while reporting optional integrations", () => {
  const result = evaluateReadiness({
    db: { status: "ok" },
    redis: { status: "ok" },
    auth: { status: "ok" },
    internalApi: { status: "ok" },
    secrets: { status: "ok" },
    stripe: { status: "not_configured", message: "Stripe is not configured" },
  });

  assert.equal(result.ready, true);
  assert.equal(result.checks.db.required, true);
  assert.equal(result.checks.redis.required, true);
  assert.equal(result.checks.auth.required, true);
  assert.equal(result.checks.internalApi.required, true);
  assert.equal(result.checks.secrets.required, true);
  assert.equal(result.checks.stripe.required, false);
});

test("readiness can require selected integrations and fails on unknown names", () => {
  const missingStripe = evaluateReadiness(
    {
      db: { status: "ok" },
      redis: { status: "ok" },
      auth: { status: "ok" },
      internalApi: { status: "ok" },
      secrets: { status: "ok" },
      stripe: { status: "not_configured" },
    },
    "stripe"
  );
  assert.equal(missingStripe.ready, false);
  assert.equal(missingStripe.checks.stripe.required, true);

  const unknown = evaluateReadiness(
    {
      db: { status: "ok" },
      redis: { status: "ok" },
      auth: { status: "ok" },
      internalApi: { status: "ok" },
      secrets: { status: "ok" },
    },
    "unknown-service"
  );
  assert.equal(unknown.ready, false);
  assert.deepEqual(unknown.unknownRequiredIntegrations, ["unknown-service"]);
});
