import { createHash } from "node:crypto";

export type BranchProtection = "open" | "protected";
export type VariantAllocation = { variantId: string; versionId: string; percent: number };
export type ExperimentStatus = "draft" | "running" | "paused" | "completed" | "rolled_back";

export type ExperimentDefinition = {
  experimentId: string;
  organizationId: string;
  hypothesis: string;
  ownerId: string;
  assignmentUnit: "caller" | "contact" | "session";
  mutualExclusionGroup?: string;
  eligibility: Record<string, string>;
  exclusions?: Record<string, string>;
  variants: VariantAllocation[];
  holdoutPercent?: number;
  primaryMetricId: string;
  guardrails: Array<{ metricId: string; operator: "lt" | "lte" | "gt" | "gte"; threshold: number }>;
};

export type AssignmentContext = {
  organizationId: string;
  unitId: string;
  attributes: Record<string, string>;
  existingMutualExclusionGroups?: string[];
};

export type DeploymentPointer = {
  environmentId: string;
  activeVersionId: string;
  previousVersionId?: string;
  updatedAt: string;
};

export function validateExperimentDefinition(experiment: ExperimentDefinition): string[] {
  const issues: string[] = [];
  if (!experiment.hypothesis.trim()) issues.push("experiment hypothesis is required");
  if (experiment.variants.length < 2) issues.push("at least two variants are required");
  const allocated = experiment.variants.reduce((sum, variant) => sum + variant.percent, experiment.holdoutPercent ?? 0);
  if (allocated > 100) issues.push("variant and holdout allocation cannot exceed 100%" );
  for (const variant of experiment.variants) {
    if (variant.percent < 0 || variant.percent > 100) issues.push(`${variant.variantId} allocation must be between 0 and 100`);
  }
  if (!experiment.primaryMetricId.trim()) issues.push("primary metric is required");
  return issues;
}

export function assignExperimentVariant(experiment: ExperimentDefinition, context: AssignmentContext) {
  if (context.organizationId !== experiment.organizationId) return { assigned: false, reason: "wrong_organization" as const };
  if (experiment.mutualExclusionGroup && context.existingMutualExclusionGroups?.includes(experiment.mutualExclusionGroup)) return { assigned: false, reason: "mutual_exclusion" as const };
  if (!matchesAttributes(context.attributes, experiment.eligibility)) return { assigned: false, reason: "not_eligible" as const };
  if (experiment.exclusions && matchesAttributes(context.attributes, experiment.exclusions)) return { assigned: false, reason: "excluded" as const };

  const bucket = deterministicPercent(`${experiment.experimentId}:${context.unitId}`);
  if (bucket < (experiment.holdoutPercent ?? 0)) return { assigned: true, reason: "holdout" as const, bucket, variantId: "holdout" };

  let cursor = experiment.holdoutPercent ?? 0;
  for (const variant of experiment.variants) {
    cursor += variant.percent;
    if (bucket < cursor) return { assigned: true, reason: "assigned" as const, bucket, variantId: variant.variantId, versionId: variant.versionId };
  }
  return { assigned: false, reason: "outside_allocation" as const, bucket };
}

export function evaluateGuardrails(experiment: ExperimentDefinition, metrics: Record<string, number>) {
  return experiment.guardrails.map((guardrail) => {
    const observed = metrics[guardrail.metricId];
    const passed = observed === undefined ? false : compare(observed, guardrail.operator, guardrail.threshold);
    return { ...guardrail, observed, passed, status: passed ? "pass" as const : "fail" as const };
  });
}

export function buildPromotionPlan(args: { deployment: DeploymentPointer; candidateVersionId: string; gateStatus: "pass" | "overridden" | "fail"; actorId: string; reason: string; now: string }) {
  if (!["pass", "overridden"].includes(args.gateStatus)) throw new Error("promotion blocked by gate");
  if (!args.reason.trim()) throw new Error("promotion reason is required");
  return {
    environmentId: args.deployment.environmentId,
    previousVersionId: args.deployment.activeVersionId,
    activeVersionId: args.candidateVersionId,
    promotedBy: args.actorId,
    reason: args.reason,
    effectiveAt: args.now,
    rollbackTargetVersionId: args.deployment.activeVersionId,
  };
}

export function buildRollbackPlan(deployment: DeploymentPointer, actorId: string, reason: string, now: string) {
  if (!deployment.previousVersionId) throw new Error("rollback target is unavailable");
  if (!reason.trim()) throw new Error("rollback reason is required");
  return {
    environmentId: deployment.environmentId,
    activeVersionId: deployment.previousVersionId,
    rolledBackFromVersionId: deployment.activeVersionId,
    rolledBackBy: actorId,
    reason,
    effectiveAt: now,
  };
}

function matchesAttributes(actual: Record<string, string>, expected: Record<string, string>) {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function deterministicPercent(seed: string) {
  return Math.floor((createHash("sha256").update(seed).digest().readUInt32BE(0) / 0xffffffff) * 10000) / 100;
}

function compare(value: number, operator: ExperimentDefinition["guardrails"][number]["operator"], threshold: number) {
  if (operator === "lt") return value < threshold;
  if (operator === "lte") return value <= threshold;
  if (operator === "gt") return value > threshold;
  return value >= threshold;
}
