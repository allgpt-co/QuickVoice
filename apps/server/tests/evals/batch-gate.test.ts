import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateEvalResults,
  assignHumanReviewTasks,
  computeReviewerAgreement,
  evaluateRegressionGate,
  type EvalCaseResult,
  type GatePolicy,
} from "../../src/modules/evals/batch-gate.js";

const results: EvalCaseResult[] = [
  { caseId: "case_1", repetition: 1, seed: "a", outcome: "pass", score: 1, latencyMs: 1000, estimatedCostCents: 4 },
  { caseId: "case_1", repetition: 2, seed: "b", outcome: "fail", score: 0, latencyMs: 1200, estimatedCostCents: 4, failureCategory: "assertion" },
  { caseId: "case_2", repetition: 1, seed: "c", outcome: "pass", score: 1, latencyMs: 800, estimatedCostCents: 3 },
  { caseId: "case_3", repetition: 1, seed: "d", outcome: "infra_error", score: 0, latencyMs: 0, estimatedCostCents: 1 },
];

test("aggregate eval results report pass rate, confidence, flakiness, failures, cost, and latency", () => {
  const aggregate = aggregateEvalResults(results);

  assert.equal(aggregate.totalRuns, 4);
  assert.equal(aggregate.completedRuns, 3);
  assert.equal(aggregate.passRate, 2 / 3);
  assert.deepEqual(aggregate.flakyCaseIds, ["case_1"]);
  assert.deepEqual(aggregate.failureClusters, [{ category: "assertion", count: 1, caseIds: ["case_1"] }]);
  assert.equal(aggregate.averageLatencyMs, 1000);
  assert.equal(aggregate.estimatedCostCents, 12);
  assert.ok(aggregate.confidenceInterval95.low < aggregate.passRate);
});

test("regression gates fail closed and support reasoned unexpired overrides", () => {
  const policy: GatePolicy = { policyId: "gate_1", minCompletedRuns: 5, minPassRate: 0.9, maxInfraFailureRate: 0.1, maxFlakyCaseRate: 0.1, requiredFailureCategories: ["assertion"] };
  const aggregate = aggregateEvalResults(results);

  assert.deepEqual(evaluateRegressionGate(policy, aggregate).status, "fail");
  assert.deepEqual(evaluateRegressionGate(policy, aggregate).ciExitCode, 1);
  assert.deepEqual(
    evaluateRegressionGate(policy, aggregate, { actorId: "release_manager", reason: "accepted known copy edge case", expiresAt: "2026-07-27T00:00:00.000Z", scope: "single_promotion" }, new Date("2026-07-26T00:00:00.000Z")),
    { status: "overridden", reasons: ["override accepted for single_promotion"], ciExitCode: 0 },
  );
});

test("human QA task assignment is deterministic and reviewer agreement identifies calibration risk", () => {
  const first = assignHumanReviewTasks({ caseIds: ["a", "b", "c"], reviewerIds: ["r1", "r2"], sampleRate: 1, seed: "suite", doubleReview: true });
  const second = assignHumanReviewTasks({ caseIds: ["a", "b", "c"], reviewerIds: ["r1", "r2"], sampleRate: 1, seed: "suite", doubleReview: true });

  assert.deepEqual(second, first);
  assert.equal(first.length, 6);
  assert.deepEqual(computeReviewerAgreement([
    { caseId: "a", reviewerId: "r1", rubricVersionId: "rubric_1", verdict: "pass" },
    { caseId: "a", reviewerId: "r2", rubricVersionId: "rubric_1", verdict: "fail" },
    { caseId: "b", reviewerId: "r1", rubricVersionId: "rubric_1", verdict: "pass" },
    { caseId: "b", reviewerId: "r2", rubricVersionId: "rubric_1", verdict: "pass" },
  ]), { overlapCases: 2, agreementRate: 0.5, drift: "needs_calibration" });
});
