import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCallbackDeduplicationKey,
  buildVoicemailSideEffectKey,
  chooseOutcomeAction,
  normalizeAnswerClassification,
  shouldStopJourney,
  transitionCallbackStatus,
  validateDispositionAssignment,
} from "../../src/modules/outbound/campaign-outcomes.js";

const policy = { mode: "synchronous" as const, unknownAction: "hang_up" as const, machineStartAction: "wait_for_beep" as const, beepAction: "drop_voicemail" as const, humanAction: "start_agent" as const };

test("provider answer results normalize to platform classifications while preserving raw evidence", () => {
  const normalized = normalizeAnswerClassification("beep", { provider: "twilio", rawValue: "beep", confidence: 0.9, observedAt: "2026-07-26T00:00:00.000Z" });

  assert.equal(normalized.classification, "machine_end_beep");
  assert.equal(normalized.evidence.rawValue, "beep");
  assert.equal(normalizeAnswerClassification("new_provider_value", normalized.evidence).classification, "unknown");
});

test("AMD policy selects one deterministic configured outcome action", () => {
  assert.equal(chooseOutcomeAction(policy, "human"), "start_agent");
  assert.equal(chooseOutcomeAction(policy, "machine_start"), "wait_for_beep");
  assert.equal(chooseOutcomeAction(policy, "machine_end_beep"), "drop_voicemail");
  assert.equal(chooseOutcomeAction(policy, "busy"), "schedule_retry");
  assert.equal(chooseOutcomeAction(policy, "unknown"), "hang_up");
});

test("voicemail side effects and callback commitments dedupe by attempt and active commitment identity", () => {
  assert.equal(buildVoicemailSideEffectKey({ campaignRunId: "run_1", recipientRunId: "rec_1", attemptNumber: 1, voicemailVersionId: "vmv_1" }), buildVoicemailSideEffectKey({ campaignRunId: "run_1", recipientRunId: "rec_1", attemptNumber: 1, voicemailVersionId: "vmv_1" }));
  assert.equal(buildCallbackDeduplicationKey({ customerId: "cust_1", channelId: "ch_1", reason: "sales", timezone: "UTC", earliestAt: "a", latestAt: "b", status: "requested" }), "cust_1:ch_1:sales:active");
});

test("dispositions require configured fields and valid terminal/retry semantics", () => {
  assert.deepEqual(validateDispositionAssignment({ code: "interested", label: "Interested", category: "success", terminal: true, retryable: false, requiredFields: ["note"] }, { note: "call back" }), []);
  assert.deepEqual(validateDispositionAssignment({ code: "bad", label: "Bad", category: "terminal", terminal: true, retryable: true, requiredFields: ["note"], deprecatedAt: "2026-01-01" }, {}), ["bad disposition is deprecated", "bad requires note", "bad cannot be terminal and retryable"]);
});

test("callback and journey state machines stop future steps on opt-out, DNC, cancel, goal, or expiry", () => {
  assert.equal(transitionCallbackStatus("requested", "scheduled"), "scheduled");
  assert.equal(transitionCallbackStatus("scheduled", "completed"), "completed");
  assert.throws(() => transitionCallbackStatus("completed", "scheduled"), /cannot transition/);
  assert.equal(shouldStopJourney("opt_out"), true);
  assert.equal(shouldStopJourney("step_completed"), false);
});
