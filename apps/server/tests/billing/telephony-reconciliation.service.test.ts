import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateUsageRefund,
  parseTelnyxCdrCsv,
  twilioFinalCost,
} from "../../src/modules/billing/telephony-reconciliation.service.js";

test("finalizes a completed Twilio call at its posted price", () => {
  assert.deepEqual(
    twilioFinalCost({ status: "completed", price: "-1.43400", priceUnit: "USD", duration: "222" }),
    { baseCostMicros: 1_434_000n, providerBillableSeconds: 222 },
  );
});

test("waits while a Twilio call price is still pending", () => {
  assert.equal(
    twilioFinalCost({ status: "completed", price: null, priceUnit: "USD", duration: "60" }),
    null,
  );
  assert.equal(
    twilioFinalCost({ status: "in-progress", price: null, priceUnit: "USD", duration: null }),
    null,
  );
});

test("finalizes unconnected Twilio calls at zero instead of retrying forever", () => {
  for (const status of ["busy", "no-answer", "canceled"]) {
    assert.deepEqual(
      twilioFinalCost({ status, price: null, priceUnit: "USD", duration: "0" }),
      { baseCostMicros: 0n, providerBillableSeconds: 0 },
    );
  }
  assert.deepEqual(
    twilioFinalCost({ status: "failed", price: "0.00000", priceUnit: "USD", duration: "0" }),
    { baseCostMicros: 0n, providerBillableSeconds: 0 },
  );
});

test("rejects a non-USD Twilio price", () => {
  assert.throws(
    () => twilioFinalCost({ status: "completed", price: "-1.00", priceUnit: "EUR", duration: "60" }),
    /Unsupported Twilio billing currency/,
  );
});

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
