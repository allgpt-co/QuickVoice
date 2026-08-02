import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeLiveKitModelUsage,
  rateCumulativeCallUsage,
} from "../../src/modules/billing/call-pricing.service.js";

test("normalizes cumulative LiveKit snake_case usage without double counting cached input", () => {
  const usage = normalizeLiveKitModelUsage([
    {
      type: "stt_usage",
      provider: "deepgram",
      model: "nova-3",
      audio_duration: 12.345,
    },
    {
      type: "llm_usage",
      provider: "bedrock",
      model: "us.amazon.nova-lite-v1:0",
      input_tokens: 1_000,
      input_cached_tokens: 400,
      output_tokens: 200,
    },
    {
      type: "tts_usage",
      provider: "deepgram",
      model: "aura-2",
      characters_count: 500,
    },
  ]);

  assert.deepEqual(usage, {
    stt: [
      { modelId: "deepgram/nova-3", audioMilliseconds: 12_345n },
    ],
    llm: [
      {
        modelId: "bedrock/us.amazon.nova-lite-v1:0",
        inputTokens: 1_000n,
        outputTokens: 200n,
      },
    ],
    tts: [{ modelId: "deepgram/aura-2", characters: 500n }],
  });
});

test("rates platform usage from cumulative milliseconds and omits telephony for web calls", () => {
  const rated = rateCumulativeCallUsage({
    connectedSeconds: 10.25,
    modelUsage: [],
  });

  assert.equal(rated.connectedMilliseconds, 10_250n);
  assert.equal(rated.telephonyEstimatedMicros, 0n);
  assert.ok(rated.platformCostMicros > 0n);
  assert.equal(rated.totalCostMicros, rated.platformCostMicros);
});

test("maps Deepgram runtime nova-3 usage to the selected multilingual billing rate", () => {
  const usage = normalizeLiveKitModelUsage(
    [
      {
        type: "stt_usage",
        provider: "deepgram",
        model: "nova-3",
        audio_duration: 60,
      },
    ],
    { sttModel: "deepgram/nova-3-multilingual" },
  );

  assert.deepEqual(usage.stt, [
    {
      modelId: "deepgram/nova-3-multilingual",
      audioMilliseconds: 60_000n,
    },
  ]);
});
