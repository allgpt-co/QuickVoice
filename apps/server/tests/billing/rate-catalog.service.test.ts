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

test("multilingual Nova-3 and Nova-2 use exact current per-minute bases", () => {
  const catalog = getRateCatalog();
  assert.equal(
    catalog.ai.stt["deepgram/nova-3-multilingual"]?.baseMicrosPerAudioMinute,
    "5800",
  );
  // $0.35/hour is $0.0058333.../minute, rounded up to one micro-dollar.
  assert.equal(
    catalog.ai.stt["deepgram/nova-2"]?.baseMicrosPerAudioMinute,
    "5834",
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

  assert.equal(result.baseCostMicros, 210_869n);
  assert.equal(result.markupMicros, 42_174n);
  assert.equal(result.totalCostMicros, 253_043n);
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
