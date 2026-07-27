import { createHash } from "node:crypto";

export type RuntimeStage = "stt" | "llm" | "tts" | "embedding" | "realtime";
export type RuntimeDecisionReason = "eligible" | "language_unsupported" | "region_forbidden" | "streaming_unsupported" | "voice_unmapped" | "health_below_threshold" | "latency_above_ceiling" | "cost_above_ceiling";
export type BudgetAction = "allow" | "alert" | "degrade" | "stop";

export type ProviderCapability = {
  capabilityId: string;
  stage: RuntimeStage;
  provider: string;
  model: string;
  languages: string[];
  regions: string[];
  supportsStreaming: boolean;
  supportsTools?: boolean;
  voices?: string[];
  healthScore: number;
  p95LatencyMs: number;
  estimatedCostCents: number;
};

export type RuntimeRoute = {
  stage: RuntimeStage;
  provider: string;
  model: string;
  region: string;
  voice?: string;
  weight?: number;
};

export type RuntimePolicy = {
  policyId: string;
  organizationId: string;
  version: number;
  languageAllowlist: string[];
  preferredRegions: string[];
  requireStreaming?: boolean;
  minHealthScore: number;
  maxLatencyMs?: number;
  maxEstimatedCostCents?: number;
  routes: RuntimeRoute[];
  fallbackOrder: RuntimeStage[];
  languageDetection?: {
    enabled: boolean;
    confidenceThreshold: number;
    hysteresis: number;
    defaultLanguage: string;
  };
  budget?: {
    alertCents?: number;
    degradeCents?: number;
    stopCents?: number;
  };
};

export type RuntimeSelectionInput = {
  language: string;
  seed: string;
  stage: RuntimeStage;
};

export type RuntimeDecision = {
  policyId: string;
  policyVersion: number;
  stage: RuntimeStage;
  selected?: RuntimeRoute;
  eligible: RuntimeRoute[];
  rejected: Array<{ route: RuntimeRoute; reason: RuntimeDecisionReason }>;
  reason: "selected" | "no_eligible_route";
};

export type LanguageObservation = {
  language: string;
  confidence: number;
};

export function validateRuntimePolicy(policy: RuntimePolicy, capabilities: ProviderCapability[]): string[] {
  const issues: string[] = [];
  if (policy.version < 1) issues.push("policy version must be positive");
  if (policy.minHealthScore < 0 || policy.minHealthScore > 1) issues.push("minHealthScore must be between 0 and 1");
  if (policy.languageDetection && (policy.languageDetection.confidenceThreshold < 0 || policy.languageDetection.confidenceThreshold > 1)) {
    issues.push("language detection threshold must be between 0 and 1");
  }

  for (const stage of policy.fallbackOrder) {
    if (!policy.routes.some((route) => route.stage === stage)) issues.push(`${stage} has no configured routes`);
  }

  for (const route of policy.routes) {
    const capability = findCapability(route, capabilities);
    if (!capability) {
      issues.push(`${route.stage}:${route.provider}/${route.model} has no provider capability`);
      continue;
    }
    if (!capability.regions.includes(route.region)) issues.push(`${route.stage}:${route.provider}/${route.model} does not support region ${route.region}`);
    if (route.voice && !(capability.voices ?? []).includes(route.voice)) issues.push(`${route.stage}:${route.provider}/${route.model} does not map voice ${route.voice}`);
    if (policy.requireStreaming && !capability.supportsStreaming) issues.push(`${route.stage}:${route.provider}/${route.model} does not support streaming`);
  }

  return issues;
}

export function selectRuntimeRoute(policy: RuntimePolicy, capabilities: ProviderCapability[], input: RuntimeSelectionInput): RuntimeDecision {
  const routes = policy.routes.filter((route) => route.stage === input.stage);
  const eligible: RuntimeRoute[] = [];
  const rejected: RuntimeDecision["rejected"] = [];

  for (const route of routes) {
    const capability = findCapability(route, capabilities);
    const reason = capability ? rejectReason(policy, capability, route, input.language) : "language_unsupported";
    if (reason) rejected.push({ route, reason });
    else eligible.push(route);
  }

  const selected = weightedChoice(eligible, `${policy.policyId}:${policy.version}:${input.stage}:${input.language}:${input.seed}`);
  return {
    policyId: policy.policyId,
    policyVersion: policy.version,
    stage: input.stage,
    selected,
    eligible,
    rejected,
    reason: selected ? "selected" : "no_eligible_route",
  };
}

export function resolveDetectedLanguage(policy: RuntimePolicy, previousLanguage: string, observation: LanguageObservation): { language: string; changed: boolean; reason: string } {
  const detection = policy.languageDetection;
  const defaultLanguage = detection?.defaultLanguage || policy.languageAllowlist[0] || "en-US";
  if (!detection?.enabled) return { language: previousLanguage || defaultLanguage, changed: false, reason: "language detection disabled" };
  if (!policy.languageAllowlist.includes(observation.language)) return { language: previousLanguage || defaultLanguage, changed: false, reason: "language not allowlisted" };
  if (observation.confidence < detection.confidenceThreshold) return { language: previousLanguage || defaultLanguage, changed: false, reason: "confidence below threshold" };
  if (previousLanguage && previousLanguage !== observation.language && observation.confidence < detection.confidenceThreshold + detection.hysteresis) {
    return { language: previousLanguage, changed: false, reason: "hysteresis retained previous language" };
  }
  return { language: observation.language, changed: previousLanguage !== observation.language, reason: "language accepted" };
}

export function evaluateRuntimeBudget(policy: RuntimePolicy, estimatedCostCents: number): BudgetAction {
  const budget = policy.budget;
  if (!budget) return "allow";
  if (budget.stopCents !== undefined && estimatedCostCents >= budget.stopCents) return "stop";
  if (budget.degradeCents !== undefined && estimatedCostCents >= budget.degradeCents) return "degrade";
  if (budget.alertCents !== undefined && estimatedCostCents >= budget.alertCents) return "alert";
  return "allow";
}

function rejectReason(policy: RuntimePolicy, capability: ProviderCapability, route: RuntimeRoute, language: string): RuntimeDecisionReason | undefined {
  if (!capability.languages.includes(language)) return "language_unsupported";
  if (!policy.preferredRegions.includes(route.region)) return "region_forbidden";
  if (policy.requireStreaming && !capability.supportsStreaming) return "streaming_unsupported";
  if (route.voice && !(capability.voices ?? []).includes(route.voice)) return "voice_unmapped";
  if (capability.healthScore < policy.minHealthScore) return "health_below_threshold";
  if (policy.maxLatencyMs !== undefined && capability.p95LatencyMs > policy.maxLatencyMs) return "latency_above_ceiling";
  if (policy.maxEstimatedCostCents !== undefined && capability.estimatedCostCents > policy.maxEstimatedCostCents) return "cost_above_ceiling";
  return undefined;
}

function findCapability(route: RuntimeRoute, capabilities: ProviderCapability[]) {
  return capabilities.find((capability) => capability.stage === route.stage && capability.provider === route.provider && capability.model === route.model);
}

function weightedChoice(routes: RuntimeRoute[], seed: string) {
  if (routes.length === 0) return undefined;
  const total = routes.reduce((sum, route) => sum + (route.weight ?? 1), 0);
  const hash = createHash("sha256").update(seed).digest();
  const value = hash.readUInt32BE(0) / 0xffffffff;
  let cursor = value * total;
  for (const route of routes) {
    cursor -= route.weight ?? 1;
    if (cursor <= 0) return route;
  }
  return routes[routes.length - 1];
}
