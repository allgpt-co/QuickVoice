import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildUsageLedgerEntry,
  evaluateBudgetThreshold,
  normalizeUsageDimensions,
} from "../../src/modules/billing/usage-ledger.js";

test("usage ledger entries use source idempotency and preserve finality timestamps", () => {
  const eventTimestamp = new Date("2026-07-26T10:00:00.000Z");
  const ingestedAt = new Date("2026-07-26T10:00:02.000Z");
  const entry = buildUsageLedgerEntry({
    organizationId: "org_1",
    source: "livekit",
    sourceEventId: "evt_1",
    provider: "livekit",
    resourceType: "call",
    resourceId: "call_1",
    quantity: 75,
    unit: "second",
    originalQuantity: 75,
    originalUnit: "seconds",
    currency: "USD",
    amountCents: 42,
    finality: "estimated",
    eventTimestamp,
    ingestedAt,
    dimensions: { agentId: "agent_1", campaignId: "campaign_1" },
  });

  assert.equal(entry.idempotencyKey, "livekit:evt_1");
  assert.equal(entry.eventTimestamp, eventTimestamp);
  assert.equal(entry.ingestedAt, ingestedAt);
  assert.deepEqual(entry.dimensions, { agentId: "agent_1", campaignId: "campaign_1" });
});

test("usage dimensions reject sensitive payload, prompt, contact, and secret fields", () => {
  assert.throws(() => normalizeUsageDimensions({ phoneNumber: "+15550101000" }), /not safe/);
  assert.throws(() => normalizeUsageDimensions({ promptDigest: "hello" }), /not safe/);
  assert.throws(() => normalizeUsageDimensions({ apiKey: "key_123" }), /not safe/);
  assert.deepEqual(normalizeUsageDimensions({ agentId: "agent_1", project: "support" }), {
    agentId: "agent_1",
    project: "support",
  });
});

test("budget threshold decisions distinguish warning and critical states", () => {
  assert.deepEqual(evaluateBudgetThreshold({ usedCents: 4999, budgetCents: 10000, thresholdPercent: 50 }), {
    crossed: false,
    percentUsed: 49.99,
    thresholdPercent: 50,
    severity: "ok",
  });
  assert.deepEqual(evaluateBudgetThreshold({ usedCents: 5000, budgetCents: 10000, thresholdPercent: 50 }), {
    crossed: true,
    percentUsed: 50,
    thresholdPercent: 50,
    severity: "warning",
  });
  assert.deepEqual(evaluateBudgetThreshold({ usedCents: 10000, budgetCents: 10000, thresholdPercent: 80 }), {
    crossed: true,
    percentUsed: 100,
    thresholdPercent: 80,
    severity: "critical",
  });
});
