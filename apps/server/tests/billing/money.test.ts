import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyMarkup,
  assertValidTopUpAmount,
  formatMicrosAsUsd,
  parseUsdToMicros,
} from "../../src/modules/billing/money.js";

test("USD conversion preserves integer micro-dollar precision", () => {
  assert.equal(parseUsdToMicros("5"), 5_000_000n);
  assert.equal(parseUsdToMicros("2.123456"), 2_123_456n);
  assert.equal(formatMicrosAsUsd(2_129_999n), "2.12");
  assert.equal(formatMicrosAsUsd(-500_000n), "-0.50");
  assert.throws(() => parseUsdToMicros("1.0000001"), /at most six places/);
});

test("markup rounds up without floating point arithmetic", () => {
  assert.equal(applyMarkup(10_000n, 2_000), 12_000n);
  assert.equal(applyMarkup(1n, 2_000), 2n);
});

test("top-ups must be $5 increments from $5 through $500", () => {
  assert.equal(assertValidTopUpAmount(5_000_000n), 5_000_000n);
  assert.equal(assertValidTopUpAmount(500_000_000n), 500_000_000n);
  assert.throws(() => assertValidTopUpAmount(6_000_000n), /\$5 increment/);
  assert.throws(() => assertValidTopUpAmount(505_000_000n), /\$5 increment/);
});
