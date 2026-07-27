import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDispatchIdempotencyKey,
  evaluateDispatchPreflight,
  nextRetryDelaySeconds,
  transitionCampaignRun,
  transitionRecipientAttempt,
} from "../../src/modules/outbound/campaign-lifecycle.js";

test("campaign lifecycle enforces legal control transitions and terminal archive semantics", () => {
  assert.equal(transitionCampaignRun("draft", "validate"), "validating");
  assert.equal(transitionCampaignRun("validating", "mark_ready"), "ready");
  assert.equal(transitionCampaignRun("ready", "start"), "running");
  assert.equal(transitionCampaignRun("running", "pause"), "pausing");
  assert.equal(transitionCampaignRun("pausing", "paused"), "paused");
  assert.equal(transitionCampaignRun("paused", "resume"), "running");
  assert.equal(transitionCampaignRun("archived", "start"), "archived");
  assert.throws(() => transitionCampaignRun("cancelled", "resume"), /invalid/);
});

test("recipient attempts preserve terminal states and require reconciliation for ambiguous provider outcomes", () => {
  assert.equal(transitionRecipientAttempt("eligible", "dispatching"), "dispatching");
  assert.equal(transitionRecipientAttempt("dispatching", "unknown_needs_reconciliation"), "unknown_needs_reconciliation");
  assert.equal(transitionRecipientAttempt("unknown_needs_reconciliation", "succeeded"), "succeeded");
  assert.equal(transitionRecipientAttempt("succeeded", "retry_scheduled"), "succeeded");
  assert.throws(() => transitionRecipientAttempt("pending", "in_progress"), /cannot transition/);
});

test("dispatch preflight records all last-moment policy and capacity blockers", () => {
  assert.deepEqual(evaluateDispatchPreflight({ contactabilityAllowed: true, localWindowAllowed: true, frequencyAllowed: true, quotaAllowed: true, providerAllowed: true, numberCapacityAllowed: true, policyVersionId: "polv_1" }), { allowed: true, policyVersionId: "polv_1", reasons: ["eligible"] });
  assert.deepEqual(evaluateDispatchPreflight({ contactabilityAllowed: false, localWindowAllowed: false, frequencyAllowed: false, quotaAllowed: false, providerAllowed: false, numberCapacityAllowed: false, policyVersionId: "polv_1" }).reasons, ["contactability_denied", "outside_recipient_window", "frequency_cap", "quota_exhausted", "provider_limited", "number_capacity_limited"]);
});

test("campaign dispatch idempotency and retry policy are stable per run recipient attempt", () => {
  assert.equal(buildDispatchIdempotencyKey({ campaignRunId: "run_1", recipientRunId: "rec_1", attemptNumber: 2 }), "run_1:rec_1:attempt:2");
  assert.deepEqual(nextRetryDelaySeconds({ retryableReasons: ["busy"], neverRetryReasons: ["opt_out"], maxAttempts: 3, minIntervalSeconds: 60, maxIntervalSeconds: 600, jitterSeconds: 10 }, { attemptNumber: 2, reason: "busy" }), { retry: true, reason: "retry_scheduled", delaySeconds: 126 });
  assert.deepEqual(nextRetryDelaySeconds({ retryableReasons: ["busy"], neverRetryReasons: ["opt_out"], maxAttempts: 3, minIntervalSeconds: 60, maxIntervalSeconds: 600, jitterSeconds: 10 }, { attemptNumber: 1, reason: "opt_out" }), { retry: false, reason: "never_retry" });
});
