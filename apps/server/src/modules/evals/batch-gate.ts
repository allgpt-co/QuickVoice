import { createHash } from "node:crypto";

export type EvalRunOutcome = "pass" | "fail" | "infra_error" | "canceled";
export type GateStatus = "pending" | "pass" | "fail" | "error" | "canceled" | "budget_exhausted" | "overridden";

export type EvalCaseResult = {
  caseId: string;
  repetition: number;
  seed: string;
  outcome: EvalRunOutcome;
  score: number;
  latencyMs: number;
  estimatedCostCents: number;
  failureCategory?: string;
};

export type AggregateEvalResult = {
  totalRuns: number;
  completedRuns: number;
  passRate: number;
  confidenceInterval95: { low: number; high: number };
  infraFailureRate: number;
  flakyCaseIds: string[];
  failureClusters: Array<{ category: string; count: number; caseIds: string[] }>;
  averageLatencyMs: number;
  estimatedCostCents: number;
};

export type GatePolicy = {
  policyId: string;
  minCompletedRuns: number;
  minPassRate: number;
  maxInfraFailureRate: number;
  maxFlakyCaseRate: number;
  requiredFailureCategories?: string[];
};

export type GateOverride = {
  actorId: string;
  reason: string;
  expiresAt: string;
  scope: "single_promotion" | "environment";
};

export type HumanReview = {
  caseId: string;
  reviewerId: string;
  rubricVersionId: string;
  verdict: "pass" | "fail" | "uncertain";
};

export function aggregateEvalResults(results: EvalCaseResult[]): AggregateEvalResult {
  const completed = results.filter((result) => result.outcome === "pass" || result.outcome === "fail");
  const passes = completed.filter((result) => result.outcome === "pass").length;
  const passRate = completed.length === 0 ? 0 : passes / completed.length;
  const flakyCaseIds = findFlakyCaseIds(completed);

  return {
    totalRuns: results.length,
    completedRuns: completed.length,
    passRate,
    confidenceInterval95: wilsonInterval(passes, completed.length),
    infraFailureRate: results.length === 0 ? 0 : results.filter((result) => result.outcome === "infra_error").length / results.length,
    flakyCaseIds,
    failureClusters: clusterFailures(completed),
    averageLatencyMs: completed.length === 0 ? 0 : Math.round(completed.reduce((sum, result) => sum + result.latencyMs, 0) / completed.length),
    estimatedCostCents: results.reduce((sum, result) => sum + result.estimatedCostCents, 0),
  };
}

export function evaluateRegressionGate(policy: GatePolicy, aggregate: AggregateEvalResult, override?: GateOverride, now = new Date()): { status: GateStatus; reasons: string[]; ciExitCode: number } {
  if (override) {
    if (!override.reason.trim()) return { status: "fail", reasons: ["override reason is required"], ciExitCode: 1 };
    if (new Date(override.expiresAt) <= now) return { status: "fail", reasons: ["override is expired"], ciExitCode: 1 };
    return { status: "overridden", reasons: [`override accepted for ${override.scope}`], ciExitCode: 0 };
  }

  const reasons: string[] = [];
  if (aggregate.completedRuns < policy.minCompletedRuns) reasons.push("insufficient completed runs");
  if (aggregate.passRate < policy.minPassRate) reasons.push("pass rate below gate threshold");
  if (aggregate.infraFailureRate > policy.maxInfraFailureRate) reasons.push("infrastructure failure rate above threshold");
  if (aggregate.totalRuns > 0 && aggregate.flakyCaseIds.length / aggregate.totalRuns > policy.maxFlakyCaseRate) reasons.push("flakiness above threshold");
  for (const category of policy.requiredFailureCategories ?? []) {
    if (aggregate.failureClusters.some((cluster) => cluster.category === category)) reasons.push(`blocked failure category present: ${category}`);
  }

  return reasons.length === 0 ? { status: "pass", reasons: [], ciExitCode: 0 } : { status: "fail", reasons, ciExitCode: 1 };
}

export function assignHumanReviewTasks(args: { caseIds: string[]; reviewerIds: string[]; sampleRate: number; seed: string; doubleReview?: boolean }) {
  if (args.reviewerIds.length === 0) throw new Error("at least one reviewer is required");
  if (args.doubleReview && args.reviewerIds.length < 2) throw new Error("double review requires at least two reviewers");
  const selected = args.caseIds.filter((caseId) => deterministicUnit(`${args.seed}:${caseId}`) < args.sampleRate);
  return selected.flatMap((caseId, index) => {
    const first = args.reviewerIds[index % args.reviewerIds.length]!;
    const reviewers = args.doubleReview ? [first, args.reviewerIds[(index + 1) % args.reviewerIds.length]!] : [first];
    return reviewers.map((reviewerId, assignmentIndex) => ({ taskId: `qa_${hashText(`${caseId}:${reviewerId}:${assignmentIndex}`).slice(0, 12)}`, caseId, reviewerId }));
  });
}

export function computeReviewerAgreement(reviews: HumanReview[]) {
  const byCase = new Map<string, HumanReview[]>();
  for (const review of reviews) byCase.set(review.caseId, [...(byCase.get(review.caseId) ?? []), review]);
  const overlapping = [...byCase.values()].filter((caseReviews) => caseReviews.length > 1);
  if (overlapping.length === 0) return { overlapCases: 0, agreementRate: 0, drift: "insufficient_overlap" as const };
  const agreements = overlapping.filter((caseReviews) => new Set(caseReviews.map((review) => review.verdict)).size === 1).length;
  const agreementRate = agreements / overlapping.length;
  return { overlapCases: overlapping.length, agreementRate, drift: agreementRate < 0.7 ? "needs_calibration" as const : "calibrated" as const };
}

function clusterFailures(results: EvalCaseResult[]) {
  const clusters = new Map<string, Set<string>>();
  for (const result of results) {
    if (result.outcome !== "fail") continue;
    const category = result.failureCategory ?? "uncategorized";
    clusters.set(category, (clusters.get(category) ?? new Set()).add(result.caseId));
  }
  return [...clusters.entries()].map(([category, caseIds]) => ({ category, count: caseIds.size, caseIds: [...caseIds].sort() })).sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

function findFlakyCaseIds(results: EvalCaseResult[]) {
  const byCase = new Map<string, Set<EvalRunOutcome>>();
  for (const result of results) byCase.set(result.caseId, (byCase.get(result.caseId) ?? new Set()).add(result.outcome));
  return [...byCase.entries()].filter(([, outcomes]) => outcomes.size > 1).map(([caseId]) => caseId).sort();
}

function wilsonInterval(successes: number, total: number) {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return { low: roundRate((center - margin) / denominator), high: roundRate((center + margin) / denominator) };
}

function deterministicUnit(seed: string) {
  return createHash("sha256").update(seed).digest().readUInt32BE(0) / 0xffffffff;
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function roundRate(value: number) {
  return Math.round(value * 10000) / 10000;
}
