import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateAiUsageCostBreakdown,
  calculateEstimatedTelephonyChargeMicros,
  calculateNumberRentalPriceMicros,
  calculatePlatformFeeFromMilliseconds,
  calculatePlatformFeeMicros,
  calculateTelephonyChargeMicros,
  getRateCatalog,
  parseRateCatalogSnapshot,
} from "../../src/modules/billing/rate-catalog.service.js";

test("deploy-time catalog covers every selectable voice model", () => {
  const catalog = getRateCatalog();

  for (const model of [
    "deepgram/nova-3",
    "deepgram/nova-3-multilingual",
    "deepgram/nova-2",
    "sarvam/saaras:v3",
  ]) {
    assert.ok(catalog.ai.stt[model], `missing ${model}`);
  }
  for (const model of [
    "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "bedrock/us.amazon.nova-micro-v1:0",
    "bedrock/us.amazon.nova-lite-v1:0",
  ]) {
    assert.ok(catalog.ai.llm[model], `missing ${model}`);
  }
  for (const model of [
    "deepgram/aura-2",
    "elevenlabs/eleven_flash_v2_5",
    "elevenlabs/eleven_turbo_v2_5",
    "sarvam/bulbul:v3",
  ]) {
    assert.ok(catalog.ai.tts[model], `missing ${model}`);
  }
  assert.equal(catalog.markupBasisPoints.ai, 2_000);
  assert.equal(catalog.markupBasisPoints.telephony, 2_000);
  assert.equal(
    catalog.foreignExchangeSnapshots.INR?.currencyUnitsPerUsd,
    "96.5600",
  );
});

test("Deepgram uses regular PAYG streaming and TTS prices with the existing 20% markup", () => {
  const catalog = getRateCatalog();
  assert.equal(catalog.priceBasis, "regular");
  assert.equal(catalog.catalogVersion, "2026-09-29.1");
  assert.equal(
    catalog.ai.stt["deepgram/nova-3"]?.baseMicrosPerAudioMinute,
    "7700",
  );
  assert.equal(
    catalog.ai.stt["deepgram/nova-3-multilingual"]?.baseMicrosPerAudioMinute,
    "9200",
  );
  // $0.35/hour is $0.0058333.../minute, rounded up to one micro-dollar.
  assert.equal(
    catalog.ai.stt["deepgram/nova-2"]?.baseMicrosPerAudioMinute,
    "5834",
  );
  assert.equal(
    catalog.ai.tts["deepgram/aura-2"]?.baseMicrosPerThousandCharacters,
    "30000",
  );
  assert.equal(
    calculateAiUsageCostBreakdown({
      stt: [{ modelId: "deepgram/nova-3", audioMilliseconds: 60_000n }],
    }).totalCostMicros,
    9_240n,
  );
  assert.equal(
    calculateAiUsageCostBreakdown({
      stt: [
        { modelId: "deepgram/nova-3-multilingual", audioMilliseconds: 60_000n },
      ],
    }).totalCostMicros,
    11_040n,
  );
  assert.equal(
    calculateAiUsageCostBreakdown({
      tts: [{ modelId: "deepgram/aura-2", characters: 1_000n }],
    }).totalCostMicros,
    36_000n,
  );
});

test("historical call snapshots retain their promotional rates after the default catalog changes", () => {
  const prior = {
    ...structuredClone(getRateCatalog()),
    catalogVersion: "2026-08-01.1",
    effectiveAt: "2026-08-01T00:00:00.000Z",
    priceBasis: undefined,
  };
  prior.ai.stt["deepgram/nova-3"]!.baseMicrosPerAudioMinute = "4800";
  prior.ai.stt["deepgram/nova-3-multilingual"]!.baseMicrosPerAudioMinute =
    "5800";
  const snapshot = parseRateCatalogSnapshot(JSON.parse(JSON.stringify(prior)));
  assert.equal(
    calculateAiUsageCostBreakdown(
      {
        stt: [{ modelId: "deepgram/nova-3", audioMilliseconds: 60_000n }],
      },
      snapshot,
    ).totalCostMicros,
    5_760n,
  );
  assert.equal(
    calculateAiUsageCostBreakdown(
      {
        stt: [
          {
            modelId: "deepgram/nova-3-multilingual",
            audioMilliseconds: 60_000n,
          },
        ],
      },
      snapshot,
    ).totalCostMicros,
    6_960n,
  );
  assert.equal(
    getRateCatalog().ai.stt["deepgram/nova-3"]!.baseMicrosPerAudioMinute,
    "7700",
  );
});

test("AI cost uses measured provider units then applies the 20% markup", () => {
  const result = calculateAiUsageCostBreakdown({
    stt: [{ modelId: "nova-3", audioMilliseconds: 60_000n }],
    llm: [
      {
        modelId: "us.amazon.nova-micro-v1:0",
        inputTokens: 1_000_000n,
        outputTokens: 1_000_000n,
      },
    ],
    tts: [{ modelId: "bulbul:v3", characters: 1_000n }],
  });

  assert.equal(result.baseCostMicros, 213_769n);
  assert.equal(result.markupMicros, 42_754n);
  assert.equal(result.totalCostMicros, 256_523n);
});

test("platform billing is prorated by whole connected second", () => {
  assert.equal(calculatePlatformFeeMicros(1), 167n);
  assert.equal(calculatePlatformFeeMicros(60), 10_000n);
  assert.equal(calculatePlatformFeeFromMilliseconds(60_001n), 10_167n);
});

test("telephony and number pricing apply markup with a $2 rental floor", () => {
  assert.equal(calculateTelephonyChargeMicros(10_000n), 12_000n);
  assert.equal(
    calculateEstimatedTelephonyChargeMicros({
      provider: "twilio",
      direction: "outbound",
      providerBillableMinutes: 2n,
    }),
    33_600n,
  );
  assert.equal(calculateNumberRentalPriceMicros(1_150_000n), 2_000_000n);
  assert.equal(calculateNumberRentalPriceMicros(2_000_000n), 2_400_000n);
});
