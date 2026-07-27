import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRuntimeBudget,
  resolveDetectedLanguage,
  selectRuntimeRoute,
  validateRuntimePolicy,
  type ProviderCapability,
  type RuntimePolicy,
} from "../../src/modules/runtime/runtime-policy.js";

const capabilities: ProviderCapability[] = [
  { capabilityId: "stt_good", stage: "stt", provider: "deepgram", model: "nova-3", languages: ["en-US", "es-ES"], regions: ["us"], supportsStreaming: true, healthScore: 0.99, p95LatencyMs: 200, estimatedCostCents: 2 },
  { capabilityId: "tts_good", stage: "tts", provider: "deepgram", model: "aura-2", languages: ["en-US"], regions: ["us"], supportsStreaming: true, voices: ["aura-2-asteria-en"], healthScore: 0.95, p95LatencyMs: 250, estimatedCostCents: 3 },
  { capabilityId: "llm_slow", stage: "llm", provider: "anthropic", model: "claude-sonnet-4-5", languages: ["en-US"], regions: ["us"], supportsStreaming: true, supportsTools: true, healthScore: 0.9, p95LatencyMs: 5000, estimatedCostCents: 12 },
];

const policy: RuntimePolicy = {
  policyId: "rp_1",
  organizationId: "org_1",
  version: 1,
  languageAllowlist: ["en-US", "es-ES"],
  preferredRegions: ["us"],
  requireStreaming: true,
  minHealthScore: 0.8,
  maxLatencyMs: 1000,
  maxEstimatedCostCents: 10,
  routes: [
    { stage: "stt", provider: "deepgram", model: "nova-3", region: "us", weight: 2 },
    { stage: "tts", provider: "deepgram", model: "aura-2", region: "us", voice: "aura-2-asteria-en" },
    { stage: "llm", provider: "anthropic", model: "claude-sonnet-4-5", region: "us" },
  ],
  fallbackOrder: ["stt", "llm", "tts"],
  languageDetection: { enabled: true, confidenceThreshold: 0.75, hysteresis: 0.1, defaultLanguage: "en-US" },
  budget: { alertCents: 50, degradeCents: 80, stopCents: 100 },
};

test("runtime policy validation checks stage capabilities, streaming, regions, and voice mapping", () => {
  assert.deepEqual(validateRuntimePolicy(policy, capabilities), []);
  assert.deepEqual(
    validateRuntimePolicy({ ...policy, routes: [{ stage: "tts", provider: "deepgram", model: "aura-2", region: "eu", voice: "missing" }], fallbackOrder: ["tts", "llm"] }, capabilities),
    [
      "llm has no configured routes",
      "tts:deepgram/aura-2 does not support region eu",
      "tts:deepgram/aura-2 does not map voice missing",
    ],
  );
});

test("runtime route selection explains eligible and rejected provider/model choices", () => {
  const sttDecision = selectRuntimeRoute(policy, capabilities, { stage: "stt", language: "en-US", seed: "call_1" });
  const llmDecision = selectRuntimeRoute(policy, capabilities, { stage: "llm", language: "en-US", seed: "call_1" });

  assert.equal(sttDecision.selected?.provider, "deepgram");
  assert.equal(sttDecision.reason, "selected");
  assert.equal(llmDecision.reason, "no_eligible_route");
  assert.equal(llmDecision.rejected[0].reason, "latency_above_ceiling");
});

test("language detection respects allowlist, confidence threshold, and hysteresis", () => {
  assert.deepEqual(resolveDetectedLanguage(policy, "en-US", { language: "es-ES", confidence: 0.8 }), {
    language: "en-US",
    changed: false,
    reason: "hysteresis retained previous language",
  });
  assert.deepEqual(resolveDetectedLanguage(policy, "en-US", { language: "es-ES", confidence: 0.9 }), {
    language: "es-ES",
    changed: true,
    reason: "language accepted",
  });
  assert.equal(resolveDetectedLanguage(policy, "en-US", { language: "fr-FR", confidence: 0.99 }).reason, "language not allowlisted");
});

test("runtime budgets apply alert, degrade, and hard-stop precedence", () => {
  assert.equal(evaluateRuntimeBudget(policy, 12), "allow");
  assert.equal(evaluateRuntimeBudget(policy, 50), "alert");
  assert.equal(evaluateRuntimeBudget(policy, 80), "degrade");
  assert.equal(evaluateRuntimeBudget(policy, 100), "stop");
});
