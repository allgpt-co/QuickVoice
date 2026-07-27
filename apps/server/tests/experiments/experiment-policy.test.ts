import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assignExperimentVariant,
  buildPromotionPlan,
  buildRollbackPlan,
  evaluateGuardrails,
  validateExperimentDefinition,
  type ExperimentDefinition,
} from "../../src/modules/experiments/experiment-policy.js";

const experiment: ExperimentDefinition = {
  experimentId: "exp_1",
  organizationId: "org_1",
  hypothesis: "Shorter greeting improves completion",
  ownerId: "user_1",
  assignmentUnit: "caller",
  mutualExclusionGroup: "homepage_voice",
  eligibility: { locale: "en-US" },
  exclusions: { dnc: "true" },
  holdoutPercent: 10,
  variants: [
    { variantId: "control", versionId: "v1", percent: 45 },
    { variantId: "candidate", versionId: "v2", percent: 45 },
  ],
  primaryMetricId: "completion_rate",
  guardrails: [{ metricId: "failed_rate", operator: "lte", threshold: 0.05 }],
};

test("experiment definitions validate allocation, hypothesis, variants, and metrics", () => {
  assert.deepEqual(validateExperimentDefinition(experiment), []);
  assert.deepEqual(validateExperimentDefinition({ ...experiment, hypothesis: "", variants: [{ variantId: "only", versionId: "v1", percent: 101 }], primaryMetricId: "" }), [
    "experiment hypothesis is required",
    "at least two variants are required",
    "variant and holdout allocation cannot exceed 100%",
    "only allocation must be between 0 and 100",
    "primary metric is required",
  ]);
});

test("experiment assignment is deterministic, tenant-scoped, eligible, and mutually exclusive", () => {
  const context = { organizationId: "org_1", unitId: "caller_123", attributes: { locale: "en-US" } };
  const first = assignExperimentVariant(experiment, context);
  const second = assignExperimentVariant(experiment, context);

  assert.deepEqual(second, first);
  assert.notEqual(first.reason, "not_eligible");
  assert.equal(assignExperimentVariant(experiment, { ...context, organizationId: "org_2" }).reason, "wrong_organization");
  assert.equal(assignExperimentVariant(experiment, { ...context, attributes: { locale: "fr-FR" } }).reason, "not_eligible");
  assert.equal(assignExperimentVariant(experiment, { ...context, existingMutualExclusionGroups: ["homepage_voice"] }).reason, "mutual_exclusion");
});

test("guardrails and promotion plans fail closed unless gates pass or are overridden", () => {
  assert.deepEqual(evaluateGuardrails(experiment, { failed_rate: 0.03 })[0].status, "pass");
  assert.deepEqual(evaluateGuardrails(experiment, { failed_rate: 0.1 })[0].status, "fail");
  assert.throws(() => buildPromotionPlan({ deployment: { environmentId: "prod", activeVersionId: "v1", updatedAt: "now" }, candidateVersionId: "v2", gateStatus: "fail", actorId: "user_1", reason: "ship", now: "2026-07-26T00:00:00.000Z" }), /blocked/);
  assert.deepEqual(buildPromotionPlan({ deployment: { environmentId: "prod", activeVersionId: "v1", updatedAt: "now" }, candidateVersionId: "v2", gateStatus: "pass", actorId: "user_1", reason: "passed gate", now: "2026-07-26T00:00:00.000Z" }).rollbackTargetVersionId, "v1");
});

test("rollback plans atomically restore the previous deployment pointer", () => {
  assert.deepEqual(buildRollbackPlan({ environmentId: "prod", activeVersionId: "v2", previousVersionId: "v1", updatedAt: "now" }, "user_1", "guardrail failure", "2026-07-26T01:00:00.000Z"), {
    environmentId: "prod",
    activeVersionId: "v1",
    rolledBackFromVersionId: "v2",
    rolledBackBy: "user_1",
    reason: "guardrail failure",
    effectiveAt: "2026-07-26T01:00:00.000Z",
  });
});
