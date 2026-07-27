import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildHandoffSummary,
  selectQueueMembers,
  transitionHandoffState,
  validateHandoffPolicy,
  type HandoffPolicy,
} from "../../src/modules/handoffs/handoff-policy.js";

const policy: HandoffPolicy = {
  policyId: "hp_1",
  organizationId: "org_1",
  version: 1,
  mode: "warm",
  maxWaitSeconds: 45,
  fallbacks: {
    reject: ["next_target", "offer_callback"],
    timeout: ["next_target", "terminate"],
    no_answer: ["return_to_agent"],
    failure: ["offer_callback"],
  },
  summaryAllowedFields: ["intent", "verified_account", "unresolved_item"],
};

test("handoff state machine rejects invalid live-control transitions and keeps terminal states final", () => {
  assert.equal(transitionHandoffState("requested", "brief_ready"), "briefing");
  assert.equal(transitionHandoffState("briefing", "target_ringing"), "ringing");
  assert.equal(transitionHandoffState("ringing", "target_accepted"), "accepted");
  assert.equal(transitionHandoffState("accepted", "bridge_started"), "bridged");
  assert.equal(transitionHandoffState("bridged", "bridge_completed"), "completed");
  assert.equal(transitionHandoffState("completed", "provider_failed"), "completed");
  assert.throws(() => transitionHandoffState("requested", "bridge_started"), /invalid/);
});

test("handoff policy validation detects unreachable terminal fallbacks and sensitive summary fields", () => {
  assert.deepEqual(validateHandoffPolicy(policy), []);
  assert.deepEqual(
    validateHandoffPolicy({
      ...policy,
      maxWaitSeconds: 0,
      fallbacks: { ...policy.fallbacks, reject: ["next_target"] },
      summaryAllowedFields: ["intent", "phone_number"],
    }),
    [
      "maxWaitSeconds must be between 1 and 3600",
      "reject fallback has no terminal action",
      "reject fallback can loop forever after next_target",
      "summary exposes sensitive fields: phone_number",
    ],
  );
});

test("queue routing respects tenant, skills, language, availability, capacity, and strategy", () => {
  const routed = selectQueueMembers(
    { organizationId: "org_1", requiredSkills: ["billing"], language: "en-US", strategy: "least_busy" },
    [
      { memberId: "busy", organizationId: "org_1", available: true, skills: ["billing"], languages: ["en-US"], priority: 5, activeCalls: 3, maxConcurrentCalls: 3 },
      { memberId: "wrong_org", organizationId: "org_2", available: true, skills: ["billing"], languages: ["en-US"], priority: 9, activeCalls: 0, maxConcurrentCalls: 2 },
      { memberId: "senior", organizationId: "org_1", available: true, skills: ["billing"], languages: ["en-US"], priority: 10, activeCalls: 1, maxConcurrentCalls: 3 },
      { memberId: "junior", organizationId: "org_1", available: true, skills: ["billing"], languages: ["en-US"], priority: 1, activeCalls: 0, maxConcurrentCalls: 2 },
    ],
  );

  assert.deepEqual(routed.map((member) => member.memberId), ["junior", "senior"]);
});

test("structured handoff summaries separate generated text from verified allowed facts and redact zero-pii content", () => {
  const summary = buildHandoffSummary(policy, {
    verifiedFacts: {
      intent: "billing dispute",
      phone_number: "+1 555 010 1000",
      verified_account: "customer aman@example.com verified by order id",
    },
    generatedSummary: "Caller at aman@example.com sounds worried about invoice #44.",
    unresolvedItems: ["refund eligibility"],
    sentiment: "negative",
    zeroPii: true,
  });

  assert.deepEqual(Object.keys(summary.verifiedFacts), ["intent", "verified_account"]);
  assert.equal(summary.verifiedFacts.verified_account, "customer [redacted email] verified by order id");
  assert.match(summary.generated.text, /\[redacted email\]/);
  assert.equal(summary.generated.source, "ai_generated");
});
