import assert from "node:assert/strict";
import test from "node:test";

process.env.NUMBER_QUOTE_SIGNING_SECRET = "test-number-quote-secret";

const { createNumberQuote, verifyNumberQuote } =
  await import("../../src/modules/numbers/number-quote.service.js");
const { TelephonyProvider } =
  await import("../../prisma/generated/prisma/client.js");

test("number quote binds organization, provider, number, and calculated rental", () => {
  const quote = createNumberQuote({
    organizationId: "org_a",
    phoneNumber: "+14155550100",
    provider: TelephonyProvider.TWILIO,
    providerMonthlyCostMicros: 1_000_000n,
    billingCountryIso: "us",
    billingNumberType: "LOCAL",
    now: new Date("2026-08-01T00:00:00.000Z"),
  });
  const verified = verifyNumberQuote({
    quoteId: quote.quoteId,
    organizationId: "org_a",
    phoneNumber: "+14155550100",
    provider: TelephonyProvider.TWILIO,
    now: new Date("2026-08-01T00:05:00.000Z"),
  });

  assert.equal(verified.monthlyPriceMicros, 2_000_000n);
  assert.equal(verified.providerMonthlyCostMicros, 1_000_000n);
  assert.equal(verified.billingCountryIso, "US");
  assert.equal(verified.billingNumberType, "local");
});

test("number quote cannot be moved between organizations", () => {
  const quote = createNumberQuote({
    organizationId: "org_a",
    phoneNumber: "+14155550100",
    provider: TelephonyProvider.TELNYX,
    providerMonthlyCostMicros: 2_000_000n,
    billingCountryIso: "US",
    billingNumberType: "local",
  });

  assert.throws(
    () =>
      verifyNumberQuote({
        quoteId: quote.quoteId,
        organizationId: "org_b",
        phoneNumber: quote.phoneNumber,
        provider: quote.provider,
      }),
    /Invalid number price quote/,
  );
});

test("country and number-type billing metadata are covered by the quote signature", () => {
  const quote = createNumberQuote({
    organizationId: "org_a",
    phoneNumber: "+14155550100",
    provider: TelephonyProvider.TWILIO,
    providerMonthlyCostMicros: 1_000_000n,
    billingCountryIso: "US",
    billingNumberType: "local",
  });
  const [body, signature] = quote.quoteId.split(".");
  const payload = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
  payload.billingCountryIso = "CA";
  const tamperedQuoteId = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;

  assert.throws(
    () =>
      verifyNumberQuote({
        quoteId: tamperedQuoteId,
        organizationId: "org_a",
        phoneNumber: quote.phoneNumber,
        provider: quote.provider,
      }),
    /Invalid number price quote/,
  );
});
