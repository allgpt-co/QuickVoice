import { parseUsdToMicros } from "../billing/money.js";

export type TelnyxChargesBreakdownData = {
  currency: string;
  results: Array<{
    tn: string;
    services: Array<{ cost: string; cost_type: string; name: string }>;
  }>;
};

function canonicalPhoneNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Selects only an exact TN match and sums every monthly recurring service on
 * that number. The endpoint exposes one account-level currency, so anything
 * other than USD fails closed before any amount is used for customer billing.
 */
export function exactTelnyxNumberMrcMicros(
  data: TelnyxChargesBreakdownData,
  phoneNumber: string,
): bigint {
  if (data.currency.trim().toUpperCase() !== "USD") {
    throw new Error(
      `Unsupported Telnyx charges breakdown currency: ${data.currency}`,
    );
  }

  const target = canonicalPhoneNumber(phoneNumber);
  if (!target) throw new Error("Telnyx phone number is invalid");

  const services = data.results
    .filter((result) => canonicalPhoneNumber(result.tn) === target)
    .flatMap((result) => result.services)
    .filter((service) => service.cost_type.trim().toUpperCase() === "MRC");

  if (services.length === 0) {
    throw new Error(
      `Telnyx has no exact USD MRC charge for phone number ${phoneNumber}`,
    );
  }

  return services.reduce(
    (total, service) => total + parseUsdToMicros(service.cost),
    0n,
  );
}

/** Returns a maximum-length, completed UTC reporting window (31 days). */
export function telnyxChargesBreakdownWindow(now: Date): {
  start_date: string;
  end_date: string;
} {
  const endExclusive = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startInclusive = new Date(
    endExclusive.getTime() - 31 * 24 * 60 * 60 * 1_000,
  );
  return {
    start_date: startInclusive.toISOString().slice(0, 10),
    end_date: endExclusive.toISOString().slice(0, 10),
  };
}
