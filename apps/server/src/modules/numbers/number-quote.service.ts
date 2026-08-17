import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { TelephonyProvider } from "../../../prisma/generated/prisma/client.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import {
  calculateNumberRentalPriceMicros,
  getRateCatalog,
} from "../billing/rate-catalog.service.js";

const QUOTE_TTL_MS = 10 * 60 * 1_000;
const ephemeralDevelopmentSecret = randomBytes(32).toString("base64url");

export type NumberQuote = {
  quoteId: string;
  phoneNumber: string;
  provider: TelephonyProvider;
  providerMonthlyCostMicros: bigint;
  monthlyPriceMicros: bigint;
  billingCountryIso: string;
  billingNumberType: string;
  expiresAt: string;
  rateCatalogVersion: string;
};

type QuotePayload = {
  v: 2;
  organizationId: string;
  phoneNumber: string;
  provider: TelephonyProvider;
  providerMonthlyCostMicros: string;
  monthlyPriceMicros: string;
  billingCountryIso: string;
  billingNumberType: string;
  expiresAt: number;
  rateCatalogVersion: string;
  nonce: string;
};

export function createNumberQuote(args: {
  organizationId: string;
  phoneNumber: string;
  provider: TelephonyProvider;
  providerMonthlyCostMicros: bigint;
  billingCountryIso: string;
  billingNumberType: string;
  now?: Date;
}): NumberQuote {
  const expiresAt = (args.now?.getTime() ?? Date.now()) + QUOTE_TTL_MS;
  const monthlyPriceMicros = calculateNumberRentalPriceMicros(
    args.providerMonthlyCostMicros,
  );
  const billingCountryIso = normalizeCountryIso(args.billingCountryIso);
  const billingNumberType = normalizeNumberType(args.billingNumberType);
  const payload: QuotePayload = {
    v: 2,
    organizationId: args.organizationId,
    phoneNumber: args.phoneNumber,
    provider: args.provider,
    providerMonthlyCostMicros: args.providerMonthlyCostMicros.toString(),
    monthlyPriceMicros: monthlyPriceMicros.toString(),
    billingCountryIso,
    billingNumberType,
    expiresAt,
    rateCatalogVersion: getRateCatalog().catalogVersion,
    nonce: randomBytes(12).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);
  return {
    quoteId: `${body}.${signature}`,
    phoneNumber: args.phoneNumber,
    provider: args.provider,
    providerMonthlyCostMicros: args.providerMonthlyCostMicros,
    monthlyPriceMicros,
    billingCountryIso,
    billingNumberType,
    expiresAt: new Date(expiresAt).toISOString(),
    rateCatalogVersion: payload.rateCatalogVersion,
  };
}

export function verifyNumberQuote(args: {
  quoteId: string;
  organizationId: string;
  phoneNumber: string;
  provider: TelephonyProvider;
  now?: Date;
}): NumberQuote & { nonce: string } {
  return verifySignedNumberQuote(args, false);
}

// Recovery first authenticates the original quote even if its normal purchase
// window or catalog version has elapsed. Callers must only use this result to
// resume a matching saga that was durably created while the quote was current.
export function verifyNumberQuoteForRecovery(args: {
  quoteId: string;
  organizationId: string;
  phoneNumber: string;
  provider: TelephonyProvider;
  now?: Date;
}): NumberQuote & { nonce: string } {
  return verifySignedNumberQuote(args, true);
}

function verifySignedNumberQuote(
  args: {
    quoteId: string;
    organizationId: string;
    phoneNumber: string;
    provider: TelephonyProvider;
    now?: Date;
  },
  recovery: boolean,
): NumberQuote & { nonce: string } {
  const [body, suppliedSignature, extra] = args.quoteId.split(".");
  if (!body || !suppliedSignature || extra) throw invalidQuote();
  const expectedSignature = sign(body);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw invalidQuote();
  }

  let payload: QuotePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw invalidQuote();
  }
  if (
    payload.v !== 2 ||
    payload.organizationId !== args.organizationId ||
    payload.phoneNumber !== args.phoneNumber ||
    payload.provider !== args.provider ||
    !/^\d+$/.test(payload.providerMonthlyCostMicros) ||
    !/^\d+$/.test(payload.monthlyPriceMicros) ||
    typeof payload.billingCountryIso !== "string" ||
    typeof payload.billingNumberType !== "string" ||
    typeof payload.rateCatalogVersion !== "string" ||
    payload.rateCatalogVersion.length === 0 ||
    typeof payload.nonce !== "string" ||
    !/^[A-Za-z0-9_-]{16}$/.test(payload.nonce) ||
    !Number.isSafeInteger(payload.expiresAt)
  ) {
    throw invalidQuote();
  }
  if (!recovery && payload.expiresAt <= (args.now?.getTime() ?? Date.now())) {
    throw new BadRequestError(
      "Number price quote expired. Search again for current pricing.",
    );
  }
  if (
    !recovery &&
    payload.rateCatalogVersion !== getRateCatalog().catalogVersion
  ) {
    throw new BadRequestError(
      "Number pricing changed. Search again for a new quote.",
    );
  }

  const providerMonthlyCostMicros = BigInt(payload.providerMonthlyCostMicros);
  const monthlyPriceMicros = BigInt(payload.monthlyPriceMicros);
  if (
    monthlyPriceMicros <= 0n ||
    providerMonthlyCostMicros < 0n ||
    normalizeCountryIso(payload.billingCountryIso) !==
      payload.billingCountryIso ||
    normalizeNumberType(payload.billingNumberType) !==
      payload.billingNumberType ||
    (!recovery &&
      monthlyPriceMicros !==
        calculateNumberRentalPriceMicros(providerMonthlyCostMicros))
  ) {
    throw invalidQuote();
  }

  return {
    quoteId: args.quoteId,
    phoneNumber: payload.phoneNumber,
    provider: payload.provider,
    providerMonthlyCostMicros,
    monthlyPriceMicros,
    billingCountryIso: payload.billingCountryIso,
    billingNumberType: payload.billingNumberType,
    expiresAt: new Date(payload.expiresAt).toISOString(),
    rateCatalogVersion: payload.rateCatalogVersion,
    nonce: payload.nonce,
  };
}

function normalizeCountryIso(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw invalidQuote();
  return normalized;
}

function normalizeNumberType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(normalized)) throw invalidQuote();
  return normalized;
}

function sign(body: string): string {
  return createHmac("sha256", quoteSecret()).update(body).digest("base64url");
}

function quoteSecret(): string {
  return (
    process.env.NUMBER_QUOTE_SIGNING_SECRET?.trim() ||
    process.env.INTERNAL_API_KEY?.trim() ||
    ephemeralDevelopmentSecret
  );
}

function invalidQuote() {
  return new BadRequestError(
    "Invalid number price quote. Search again before purchasing.",
  );
}
