import { z } from "zod";

import rawRateCatalog from "../../../data/billing-rates.json" with { type: "json" };
import {
  applyMarkup,
  assertNonNegativeMicros,
  ceilDiv,
} from "./money.js";

const microsString = z.string().regex(/^\d+$/, "must be an integer micro-dollar string");
const sourceUrl = z.string().url();

export const timedRateSchema = z.object({
  baseMicrosPerMinute: microsString,
  minimumSeconds: z.number().int().min(0).max(3600),
  incrementSeconds: z.number().int().min(1).max(3600),
});

export const telephonyRouteSchema = timedRateSchema.extend({
  provider: z.enum(["twilio", "telnyx"]),
  account: z.string().min(1),
  product: z.enum(["programmable-voice", "elastic-sip", "sip-trunking"]),
  direction: z.enum(["inbound", "outbound"]),
  originPrefix: z.string().regex(/^(?:\+[1-9]\d{0,14}|ALL|ROW)$/),
  destinationPrefix: z.string().regex(/^\+[1-9]\d{0,14}$/),
  source: sourceUrl,
  description: z.string().min(1),
}).strict();

export const livekitRateSchema = timedRateSchema.extend({
  meter: z.enum(["webrtc", "sip", "twilio-connector", "agent-hosting"]),
  units: z.number().int().min(1).max(10),
}).strict();

const rateCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.string().min(1),
    currency: z.literal("USD"),
    effectiveAt: z.string().datetime(),
    priceBasis: z.enum(["regular", "account"]).optional(),
    selectedTelephonyRate: telephonyRouteSchema.optional(),
    // Only selected call meters are snapshotted; account allowances are not
    // assigned to individual callers. These are published-unit estimates.
    livekit: z.object({
      plan: z.string().min(1),
      markupBasisPoints: z.number().int().nonnegative().max(10000),
      rates: z.array(livekitRateSchema).max(4),
      source: sourceUrl,
      estimated: z.literal(true),
    }).optional(),
    reserveBufferSeconds: z.number().int().min(0).max(120).optional(),
    markupBasisPoints: z.object({
      ai: z.number().int().nonnegative(),
      telephony: z.number().int().nonnegative(),
    }),
    platformFeeMicrosPerConnectedMinute: microsString,
    minimumNumberRentalMicros: microsString,
    foreignExchangeSnapshots: z.record(
      z.string().length(3),
      z.object({
        currencyUnitsPerUsd: z.string().regex(/^\d+(?:\.\d+)?$/),
        observedAt: z.string().date(),
        source: sourceUrl,
      }),
    ),
    ai: z.object({
      stt: z.record(
        z.string(),
        z.object({
          baseMicrosPerAudioMinute: microsString,
          // Optional verified account price, kept separate from customer list pricing.
          providerMicrosPerAudioMinute: microsString.optional(),
          source: sourceUrl,
        }),
      ),
      llm: z.record(
        z.string(),
        z.object({
          baseInputMicrosPerMillionTokens: microsString,
          baseOutputMicrosPerMillionTokens: microsString,
          source: sourceUrl,
        }),
      ),
      tts: z.record(
        z.string(),
        z.object({
          baseMicrosPerThousandCharacters: microsString,
          providerMicrosPerThousandCharacters: microsString.optional(),
          source: sourceUrl,
        }),
      ),
    }),
    telephony: z.record(
      z.enum(["twilio", "telnyx"]),
      z.object({
        default: z.object({
          baseInboundMicrosPerMinute: microsString,
          baseOutboundMicrosPerMinute: microsString,
          baseNumberRentalMicrosPerThirtyDays: microsString,
        }),
        source: sourceUrl,
      }),
    ),
  })
  .strict();

export type RateCatalog = z.infer<typeof rateCatalogSchema>;
export type TelephonyCatalogProvider = keyof RateCatalog["telephony"];

const RATE_CATALOG = deepFreeze(rateCatalogSchema.parse(rawRateCatalog));

export function getRateCatalog(): Readonly<RateCatalog> {
  return RATE_CATALOG;
}

export function parseRateCatalogSnapshot(value: unknown): Readonly<RateCatalog> {
  return deepFreeze(rateCatalogSchema.parse(value));
}

export type AiUsage = {
  stt?: ReadonlyArray<{
    modelId: string;
    audioMilliseconds: bigint;
  }>;
  llm?: ReadonlyArray<{
    modelId: string;
    inputTokens: bigint;
    outputTokens: bigint;
  }>;
  tts?: ReadonlyArray<{
    modelId: string;
    characters: bigint;
  }>;
};

export type AiCostBreakdown = {
  catalogVersion: string;
  baseCostMicros: bigint;
  markupMicros: bigint;
  totalCostMicros: bigint;
  lines: Array<{
    kind: "stt" | "llm" | "tts";
    modelId: string;
    baseCostMicros: bigint;
  }>;
};

export function calculateAiUsageCostBreakdown(
  usage: AiUsage,
  catalog: Readonly<RateCatalog> = RATE_CATALOG,
): AiCostBreakdown {
  const lines: AiCostBreakdown["lines"] = [];

  for (const item of usage.stt ?? []) {
    assertNonNegativeMicros(item.audioMilliseconds, "audioMilliseconds");
    const [modelId, rate] = resolveModel(catalog.ai.stt, item.modelId, "STT");
    lines.push({
      kind: "stt",
      modelId,
      baseCostMicros: ceilDiv(
        BigInt(rate.baseMicrosPerAudioMinute) * item.audioMilliseconds,
        60_000n,
      ),
    });
  }

  for (const item of usage.llm ?? []) {
    assertNonNegativeMicros(item.inputTokens, "inputTokens");
    assertNonNegativeMicros(item.outputTokens, "outputTokens");
    const [modelId, rate] = resolveModel(catalog.ai.llm, item.modelId, "LLM");
    lines.push({
      kind: "llm",
      modelId,
      baseCostMicros:
        ceilDiv(BigInt(rate.baseInputMicrosPerMillionTokens) * item.inputTokens, 1_000_000n) +
        ceilDiv(BigInt(rate.baseOutputMicrosPerMillionTokens) * item.outputTokens, 1_000_000n),
    });
  }

  for (const item of usage.tts ?? []) {
    assertNonNegativeMicros(item.characters, "characters");
    const [modelId, rate] = resolveModel(catalog.ai.tts, item.modelId, "TTS");
    lines.push({
      kind: "tts",
      modelId,
      baseCostMicros: ceilDiv(
        BigInt(rate.baseMicrosPerThousandCharacters) * item.characters,
        1_000n,
      ),
    });
  }

  const baseCostMicros = lines.reduce((total, line) => total + line.baseCostMicros, 0n);
  const totalCostMicros = applyMarkup(baseCostMicros, catalog.markupBasisPoints.ai);
  return {
    catalogVersion: catalog.catalogVersion,
    baseCostMicros,
    markupMicros: totalCostMicros - baseCostMicros,
    totalCostMicros,
    lines,
  };
}

export function calculateAiUsageCostMicros(
  usage: AiUsage,
  catalog: Readonly<RateCatalog> = RATE_CATALOG,
): bigint {
  return calculateAiUsageCostBreakdown(usage, catalog).totalCostMicros;
}

export function calculatePlatformFeeMicros(
  connectedSeconds: number | bigint,
  catalog: Readonly<RateCatalog> = RATE_CATALOG,
): bigint {
  const seconds = typeof connectedSeconds === "number" ? BigInt(connectedSeconds) : connectedSeconds;
  assertNonNegativeMicros(seconds, "connectedSeconds");
  return ceilDiv(BigInt(catalog.platformFeeMicrosPerConnectedMinute) * seconds, 60n);
}

export function calculatePlatformFeeFromMilliseconds(
  connectedMilliseconds: bigint,
  catalog: Readonly<RateCatalog> = RATE_CATALOG,
): bigint {
  assertNonNegativeMicros(connectedMilliseconds, "connectedMilliseconds");
  return calculatePlatformFeeMicros(
    ceilDiv(connectedMilliseconds, 1_000n),
    catalog,
  );
}

export function calculateTelephonyChargeMicros(
  providerCostMicros: bigint,
  catalog: Readonly<RateCatalog> = RATE_CATALOG,
): bigint {
  return applyMarkup(providerCostMicros, catalog.markupBasisPoints.telephony);
}

export function calculateEstimatedTelephonyChargeMicros(args: {
  provider: TelephonyCatalogProvider;
  direction: "inbound" | "outbound";
  providerBillableMinutes: bigint;
}, catalog: Readonly<RateCatalog> = RATE_CATALOG): bigint {
  assertNonNegativeMicros(args.providerBillableMinutes, "providerBillableMinutes");
  const provider = catalog.telephony[args.provider];
  const rate = BigInt(
    args.direction === "inbound"
      ? provider.default.baseInboundMicrosPerMinute
      : provider.default.baseOutboundMicrosPerMinute,
  );
  return calculateTelephonyChargeMicros(
    rate * args.providerBillableMinutes,
    catalog,
  );
}

export function calculateTimedChargeMicros(
  milliseconds: bigint,
  rate: z.infer<typeof timedRateSchema>,
): bigint {
  assertNonNegativeMicros(milliseconds, "milliseconds");
  if (milliseconds === 0n) return 0n;
  const seconds = ceilDiv(milliseconds, 1000n);
  const minimum = BigInt(rate.minimumSeconds);
  const increment = BigInt(rate.incrementSeconds);
  const billable = ceilDiv(seconds > minimum ? seconds : minimum, increment) * increment;
  return ceilDiv(BigInt(rate.baseMicrosPerMinute) * billable, 60n);
}

export function calculateCallTelephonyMicros(args: {
  provider: TelephonyCatalogProvider;
  direction: "inbound" | "outbound";
  connectedMilliseconds: bigint;
}, catalog: Readonly<RateCatalog>): bigint {
  const route = catalog.selectedTelephonyRate;
  if (!route) return calculateEstimatedTelephonyChargeMicros({
    ...args, providerBillableMinutes: ceilDiv(args.connectedMilliseconds, 60_000n),
  }, catalog);
  if (route.provider !== args.provider || route.direction !== args.direction) {
    throw new Error("Call route conflicts with its frozen telephony rate");
  }
  return calculateTelephonyChargeMicros(calculateTimedChargeMicros(args.connectedMilliseconds, route), catalog);
}

export function calculateLivekitChargeMicros(milliseconds: bigint, catalog: Readonly<RateCatalog>): bigint {
  if (!catalog.livekit) return 0n; // Historical snapshots predate LiveKit pricing.
  const base = catalog.livekit.rates.reduce((sum, rate) =>
    sum + calculateTimedChargeMicros(milliseconds, rate) * BigInt(rate.units), 0n);
  return applyMarkup(base, catalog.livekit.markupBasisPoints);
}

export function calculateNumberRentalPriceMicros(
  providerMonthlyCostMicros: bigint,
  catalog: Readonly<RateCatalog> = RATE_CATALOG,
): bigint {
  const markedUp = calculateTelephonyChargeMicros(
    providerMonthlyCostMicros,
    catalog,
  );
  const minimum = BigInt(catalog.minimumNumberRentalMicros);
  return markedUp > minimum ? markedUp : minimum;
}

function resolveModel<T>(
  catalog: Record<string, T>,
  requestedModelId: string,
  kind: string,
): [string, T] {
  const exact = catalog[requestedModelId];
  if (exact) return [requestedModelId, exact];

  const suffixMatches = Object.entries(catalog).filter(
    ([candidate]) => candidate.split("/").at(-1) === requestedModelId,
  );
  if (suffixMatches.length === 1) {
    return suffixMatches[0] as [string, T];
  }
  throw new RangeError(`${kind} model is not present in rate catalog: ${requestedModelId}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
