export const MICROS_PER_USD = 1_000_000n;
export const MICROS_PER_CENT = 10_000n;
export const BASIS_POINTS_DENOMINATOR = 10_000n;
export const SIGNUP_PROMOTIONAL_CREDIT_MICROS = 5n * MICROS_PER_USD;
export const MINIMUM_TOP_UP_MICROS = 5n * MICROS_PER_USD;
export const MAXIMUM_TOP_UP_MICROS = 500n * MICROS_PER_USD;
export const TOP_UP_INCREMENT_MICROS = 5n * MICROS_PER_USD;

export function assertNonNegativeMicros(
  value: bigint,
  fieldName = "amountMicros",
): bigint {
  if (value < 0n) {
    throw new RangeError(`${fieldName} must be non-negative`);
  }
  return value;
}

export function assertPositiveMicros(
  value: bigint,
  fieldName = "amountMicros",
): bigint {
  if (value <= 0n) {
    throw new RangeError(`${fieldName} must be greater than zero`);
  }
  return value;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError("ceilDiv requires a non-negative numerator and positive denominator");
  }
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

export function multiplyAndRoundUp(
  amount: bigint,
  numerator: bigint,
  denominator: bigint,
): bigint {
  assertNonNegativeMicros(amount, "amount");
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError("multiplier must be non-negative and denominator positive");
  }
  return ceilDiv(amount * numerator, denominator);
}

export function applyMarkup(amountMicros: bigint, markupBasisPoints: number): bigint {
  assertNonNegativeMicros(amountMicros);
  if (!Number.isSafeInteger(markupBasisPoints) || markupBasisPoints < 0) {
    throw new RangeError("markupBasisPoints must be a non-negative safe integer");
  }
  return multiplyAndRoundUp(
    amountMicros,
    BASIS_POINTS_DENOMINATOR + BigInt(markupBasisPoints),
    BASIS_POINTS_DENOMINATOR,
  );
}

export function parseUsdToMicros(value: string | number): bigint {
  const normalized = typeof value === "number" ? String(value) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(normalized);
  if (!match) {
    throw new TypeError("USD amount must be a non-negative decimal with at most six places");
  }

  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? "").padEnd(6, "0");
  return whole * MICROS_PER_USD + BigInt(fraction || "0");
}

export function formatMicrosAsUsd(amountMicros: bigint): string {
  const sign = amountMicros < 0n ? "-" : "";
  const absolute = amountMicros < 0n ? -amountMicros : amountMicros;
  const whole = absolute / MICROS_PER_USD;
  const fraction = (absolute % MICROS_PER_USD).toString().padStart(6, "0");
  return `${sign}${whole}.${fraction.slice(0, 2)}`;
}

export function assertValidTopUpAmount(amountMicros: bigint): bigint {
  if (
    amountMicros < MINIMUM_TOP_UP_MICROS ||
    amountMicros > MAXIMUM_TOP_UP_MICROS ||
    amountMicros % TOP_UP_INCREMENT_MICROS !== 0n
  ) {
    throw new RangeError("Top-up amount must be a $5 increment between $5 and $500");
  }
  return amountMicros;
}
