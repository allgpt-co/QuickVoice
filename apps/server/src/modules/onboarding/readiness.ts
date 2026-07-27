export type ReadinessSeverity = "blocker" | "error" | "warning" | "info";
export type ReadinessCategory = "organization" | "provider" | "secret" | "phone" | "workflow" | "tool" | "knowledge" | "variable" | "handoff" | "disclosure" | "campaign" | "test" | "budget" | "permission";

export type ReadinessCheckResult = {
  checkId: string;
  category: ReadinessCategory;
  severity: ReadinessSeverity;
  owner: "user" | "admin" | "quickvoice";
  resourceRef: string;
  reason: string;
  remediationUrl?: string;
  evidenceAt: string;
  expiresAt?: string;
  waivable: boolean;
};

export type ReadinessWaiver = {
  checkId: string;
  actorId: string;
  reason: string;
  expiresAt: string;
  createdAt: string;
};

export type GeneratedDraftReview = {
  sourcedFacts: string[];
  templateDefaults: string[];
  aiSuggestions: string[];
  assumptions: string[];
  unresolvedPlaceholders: string[];
  proposedExternalActions: string[];
};

export const REQUIRED_READINESS_CATEGORIES: ReadinessCategory[] = [
  "organization",
  "provider",
  "secret",
  "phone",
  "workflow",
  "tool",
  "knowledge",
  "variable",
  "handoff",
  "disclosure",
  "campaign",
  "test",
  "budget",
  "permission",
];

export function evaluateReadiness(checks: ReadinessCheckResult[], waivers: ReadinessWaiver[], now = new Date()) {
  const activeWaivers = new Map(waivers.filter((waiver) => waiver.reason.trim() && new Date(waiver.expiresAt) > now).map((waiver) => [waiver.checkId, waiver]));
  const missingCategories = REQUIRED_READINESS_CATEGORIES.filter((category) => !checks.some((check) => check.category === category));
  const open = checks.filter((check) => !isExpired(check, now) && !isWaived(check, activeWaivers));
  const nonWaivableBlockers = open.filter((check) => check.severity === "blocker" && !check.waivable);
  const waivableBlockers = open.filter((check) => check.severity === "blocker" && check.waivable);
  const warnings = open.filter((check) => check.severity === "warning");

  return {
    status: nonWaivableBlockers.length > 0 || missingCategories.length > 0 ? "blocked" as const : waivableBlockers.length > 0 ? "needs_waiver" as const : warnings.length > 0 ? "ready_with_warnings" as const : "ready" as const,
    missingCategories,
    nonWaivableBlockers,
    waivableBlockers,
    warnings,
    appliedWaivers: checks.filter((check) => isWaived(check, activeWaivers)).map((check) => activeWaivers.get(check.checkId)),
  };
}

export function validateReadinessWaiver(check: ReadinessCheckResult, waiver: ReadinessWaiver, now = new Date()) {
  const issues: string[] = [];
  if (!check.waivable) issues.push("check is not waivable");
  if (waiver.checkId !== check.checkId) issues.push("waiver check mismatch");
  if (!waiver.reason.trim()) issues.push("waiver reason is required");
  if (new Date(waiver.expiresAt) <= now) issues.push("waiver expiry must be in the future");
  return issues;
}

export function validateGeneratedDraftReview(review: GeneratedDraftReview) {
  const issues: string[] = [];
  if (review.aiSuggestions.length > 0 && review.assumptions.length === 0) issues.push("AI suggestions must list assumptions or uncertainty");
  if (review.unresolvedPlaceholders.length > 0) issues.push("draft has unresolved placeholders");
  if (review.proposedExternalActions.length > 0) issues.push("external actions require explicit review");
  return issues;
}

function isExpired(check: ReadinessCheckResult, now: Date) {
  return Boolean(check.expiresAt && new Date(check.expiresAt) <= now);
}

function isWaived(check: ReadinessCheckResult, activeWaivers: Map<string, ReadinessWaiver>) {
  return check.waivable && activeWaivers.has(check.checkId);
}
