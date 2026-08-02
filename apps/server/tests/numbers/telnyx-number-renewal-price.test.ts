import assert from "node:assert/strict";
import test from "node:test";

import {
  exactTelnyxNumberMrcMicros,
  telnyxChargesBreakdownWindow,
  type TelnyxChargesBreakdownData,
} from "../../src/modules/numbers/telnyx-number-renewal-price.js";

function breakdown(
  overrides: Partial<TelnyxChargesBreakdownData> = {},
): TelnyxChargesBreakdownData {
  return {
    currency: "USD",
    results: [],
    ...overrides,
  };
}

test("Telnyx renewal sums only MRC services for the exact owned TN", () => {
  const data = breakdown({
    results: [
      {
        tn: "+1 (415) 555-0100",
        services: [
          { name: "Local number", cost_type: "MRC", cost: "1.00" },
          { name: "CNAM", cost_type: "mrc", cost: "0.25" },
          { name: "Setup", cost_type: "OTC", cost: "9.00" },
        ],
      },
      {
        tn: "+14155550101",
        services: [
          { name: "Different number", cost_type: "MRC", cost: "99.00" },
        ],
      },
    ],
  });

  assert.equal(exactTelnyxNumberMrcMicros(data, "+14155550100"), 1_250_000n);
});

test("Telnyx renewal fails closed without an exact MRC match", () => {
  const data = breakdown({
    results: [
      {
        tn: "+14155550101",
        services: [{ name: "Local", cost_type: "MRC", cost: "1.00" }],
      },
      {
        tn: "+14155550100",
        services: [{ name: "Setup", cost_type: "OTC", cost: "1.00" }],
      },
    ],
  });

  assert.throws(
    () => exactTelnyxNumberMrcMicros(data, "+14155550100"),
    /no exact USD MRC charge/,
  );
});

test("Telnyx renewal rejects non-USD charge breakdowns", () => {
  const data = breakdown({ currency: "EUR" });
  assert.throws(
    () => exactTelnyxNumberMrcMicros(data, "+14155550100"),
    /currency: EUR/,
  );
});

test("Telnyx charge lookup uses a completed 31-day UTC window", () => {
  assert.deepEqual(
    telnyxChargesBreakdownWindow(new Date("2026-08-01T23:59:59.999-05:00")),
    { start_date: "2026-07-02", end_date: "2026-08-02" },
  );
});
