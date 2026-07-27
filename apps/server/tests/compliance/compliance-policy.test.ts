import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDeletionReceipt,
  calculateRetentionEligibility,
  decideRecording,
  evaluateContactPreflight,
  type ComplianceRule,
} from "../../src/modules/compliance/compliance-policy.js";

const rules: ComplianceRule[] = [
  { ruleId: "rule_outbound_missing_consent", scope: "campaign", precedence: 50, result: "needs_confirmation", reasonCode: "outbound_consent_required", conditions: { direction: "outbound", consent: "missing" } },
  { ruleId: "rule_ca_outbound", scope: "organization", precedence: 90, result: "deny", reasonCode: "jurisdiction_requires_review", conditions: { direction: "outbound", jurisdiction: "CA" } },
];

test("contact preflight returns immutable policy version, matched rules, and conservative quiet-hour/suppression decisions", () => {
  assert.deepEqual(evaluateContactPreflight({ policyVersionId: "polv_1", rules, input: { direction: "outbound", channel: "phone", jurisdiction: "CA", consent: "granted", localHour: 10 } }), {
    policyVersionId: "polv_1",
    result: "deny",
    reasonCodes: ["jurisdiction_requires_review"],
    matchedRuleIds: ["rule_ca_outbound"],
  });
  assert.deepEqual(evaluateContactPreflight({ policyVersionId: "polv_1", rules, input: { direction: "outbound", channel: "phone", consent: "granted", localHour: 22, quietHours: { startHour: 21, endHour: 8 } } }).reasonCodes, ["quiet_hours"]);
  assert.deepEqual(evaluateContactPreflight({ policyVersionId: "polv_1", rules, input: { direction: "outbound", channel: "phone", consent: "granted", suppressed: true, localHour: 12 } }).reasonCodes, ["suppressed"]);
});

test("recording decisions enforce disclosure, consent-gating, disabled, and provider-unsupported states", () => {
  assert.deepEqual(decideRecording("consent_gated", "granted", true), { record: true, reason: "record_allowed" });
  assert.deepEqual(decideRecording("consent_gated", "missing", true), { record: false, reason: "consent_required" });
  assert.deepEqual(decideRecording("disclosed_enabled", "missing", false), { record: false, reason: "disclosure_not_delivered" });
  assert.deepEqual(decideRecording("provider_unsupported", "granted", true), { record: false, reason: "provider_unsupported" });
});

test("retention eligibility respects schedules and legal holds without exposing held content", () => {
  assert.deepEqual(calculateRetentionEligibility({ createdAt: "2026-01-01T00:00:00.000Z", dataClass: "recording", schedules: [{ dataClass: "recording", retainDays: 30 }], holds: [{ holdId: "hold_1", dataClasses: ["recording"], startsAt: "2026-01-15T00:00:00.000Z" }], resourceId: "call_1", now: "2026-07-26T00:00:00.000Z" }), {
    eligible: false,
    reason: "legal_hold",
    eligibleAt: "2026-01-31T00:00:00.000Z",
    blockingHoldIds: ["hold_1"],
  });
});

test("deletion receipts report store-by-store counts and reason codes without deleted content", () => {
  assert.deepEqual(buildDeletionReceipt({ jobId: "del_1", policyVersionId: "polv_1", storeResults: [{ store: "recordings", deletedCount: 2, skippedCount: 1, reasonCodes: ["legal_hold", "legal_hold"] }, { store: "analytics", deletedCount: 5, skippedCount: 0, reasonCodes: [] }] }), {
    jobId: "del_1",
    policyVersionId: "polv_1",
    totals: { deletedCount: 7, skippedCount: 1 },
    stores: [{ store: "recordings", deletedCount: 2, skippedCount: 1, reasonCodes: ["legal_hold"] }, { store: "analytics", deletedCount: 5, skippedCount: 0, reasonCodes: [] }],
  });
});
