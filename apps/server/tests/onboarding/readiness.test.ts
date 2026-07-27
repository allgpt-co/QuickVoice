import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REQUIRED_READINESS_CATEGORIES,
  evaluateReadiness,
  validateGeneratedDraftReview,
  validateReadinessWaiver,
  type ReadinessCheckResult,
} from "../../src/modules/onboarding/readiness.js";

const completeChecks: ReadinessCheckResult[] = REQUIRED_READINESS_CATEGORIES.map((category) => ({
  checkId: `check_${category}`,
  category,
  severity: "info",
  owner: "user",
  resourceRef: category,
  reason: "ok",
  evidenceAt: "2026-07-26T10:00:00.000Z",
  waivable: true,
}));

test("readiness evaluation covers every setup category and fails closed for missing categories", () => {
  assert.equal(evaluateReadiness(completeChecks, []).status, "ready");
  const missing = evaluateReadiness(completeChecks.filter((check) => check.category !== "secret"), []);

  assert.equal(missing.status, "blocked");
  assert.deepEqual(missing.missingCategories, ["secret"]);
});

test("non-waivable blockers cannot be bypassed while waivable blockers require active reasoned waivers", () => {
  const blocker = { ...completeChecks[0], checkId: "security_blocker", severity: "blocker" as const, waivable: false };
  const waivable = { ...completeChecks[1], checkId: "budget_warning", severity: "blocker" as const, waivable: true };

  assert.equal(evaluateReadiness([...completeChecks, blocker], []).status, "blocked");
  assert.equal(evaluateReadiness([...completeChecks, waivable], []).status, "needs_waiver");
  assert.equal(evaluateReadiness([...completeChecks, waivable], [{ checkId: "budget_warning", actorId: "admin", reason: "approved for pilot", expiresAt: "2026-07-27T00:00:00.000Z", createdAt: "2026-07-26T00:00:00.000Z" }], new Date("2026-07-26T12:00:00.000Z")).status, "ready");
});

test("readiness waiver validation requires permission-safe target, reason, and future expiry", () => {
  const check = { ...completeChecks[0], checkId: "check_budget", severity: "warning" as const, waivable: true };

  assert.deepEqual(validateReadinessWaiver(check, { checkId: "check_budget", actorId: "admin", reason: "pilot", expiresAt: "2026-07-27T00:00:00.000Z", createdAt: "2026-07-26T00:00:00.000Z" }, new Date("2026-07-26T00:00:00.000Z")), []);
  assert.deepEqual(validateReadinessWaiver({ ...check, waivable: false }, { checkId: "other", actorId: "admin", reason: "", expiresAt: "2026-07-25T00:00:00.000Z", createdAt: "2026-07-26T00:00:00.000Z" }, new Date("2026-07-26T00:00:00.000Z")), ["check is not waivable", "waiver check mismatch", "waiver reason is required", "waiver expiry must be in the future"]);
});

test("generated onboarding drafts expose assumptions, placeholders, and external actions before publish", () => {
  assert.deepEqual(validateGeneratedDraftReview({ sourcedFacts: ["hours"], templateDefaults: ["greeting"], aiSuggestions: [], assumptions: [], unresolvedPlaceholders: [], proposedExternalActions: [] }), []);
  assert.deepEqual(validateGeneratedDraftReview({ sourcedFacts: [], templateDefaults: [], aiSuggestions: ["Use a dental scheduling workflow"], assumptions: [], unresolvedPlaceholders: ["{{hours}}"], proposedExternalActions: ["send SMS"] }), ["AI suggestions must list assumptions or uncertainty", "draft has unresolved placeholders", "external actions require explicit review"]);
});
