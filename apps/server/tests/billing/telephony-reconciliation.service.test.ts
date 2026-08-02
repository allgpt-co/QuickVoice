import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateUsageRefund,
  parseTelnyxCdrCsv,
} from "../../src/modules/billing/telephony-reconciliation.service.js";

test("parses quoted Telnyx CDRs and sums every provider-billed leg", () => {
  const costs = parseTelnyxCdrCsv(
    [
      "sip_call_id,billable_time,cost,start_timestamp_utc",
      '"abc@example.com",60,-0.007000,2026-08-01T00:00:00Z',
      '"abc@example.com",00:00:30.1,0.003000,2026-08-01T00:00:01Z',
      '"quoted,""call""",1.2,0.0000001,2026-08-01T00:00:02Z',
    ].join("\n"),
  );

  assert.deepEqual(costs.get("abc@example.com"), {
    baseCostMicros: 10_000n,
    providerBillableSeconds: 91,
  });
  assert.deepEqual(costs.get('quoted,"call"'), {
    baseCostMicros: 1n,
    providerBillableSeconds: 2,
  });
});

test("rejects a Telnyx CDR without exact cost correlation fields", () => {
  assert.throws(
    () => parseTelnyxCdrCsv("sip_call_id,duration\nabc,60"),
    /missing sip_call_id, cost, or billable_time/,
  );
});

test("provider over-estimate refunds unwind debt, then paid, then promo", () => {
  assert.deepEqual(
    allocateUsageRefund(1_200n, {
      debtMicros: 300n,
      paidMicros: 500n,
      promotionalMicros: 1_000n,
    }),
    { paidAmountMicros: 800n, promotionalAmountMicros: 400n },
  );
  assert.deepEqual(
    allocateUsageRefund(200n, {
      debtMicros: 300n,
      paidMicros: 500n,
      promotionalMicros: 1_000n,
    }),
    { paidAmountMicros: 200n, promotionalAmountMicros: 0n },
  );
});
