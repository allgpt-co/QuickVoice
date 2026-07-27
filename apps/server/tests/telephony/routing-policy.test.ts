import { test } from "node:test";
import assert from "node:assert/strict";

import { dryRunRoutingPolicy, normalizeDialNumber, redactSipTrunk } from "../../src/modules/telephony/routing-policy.js";

test("dial-plan normalization keeps deterministic E.164-like numbers", () => {
  assert.equal(normalizeDialNumber(" +1 (555) 010-1000 "), "+15550101000");
  assert.equal(normalizeDialNumber("555.010.1000"), "5550101000");
  assert.throws(() => normalizeDialNumber("123"), /7 to 15 digits/);
});

test("routing dry-run selects the first healthy capacity-available matching rule without placing a call", () => {
  const result = dryRunRoutingPolicy({
    policyVersion: "policy_v1",
    input: { direction: "outbound", calledNumber: "+15550101000", agentId: "agent_1", region: "us-east" },
    trunks: [
      { trunkId: "trunk_disabled", provider: "generic_sip", direction: "egress", health: "disabled", capacityAvailable: true },
      { trunkId: "trunk_healthy", provider: "telnyx", direction: "egress", health: "healthy", capacityAvailable: true, region: "us-east" },
    ],
    rules: [
      { ruleId: "rule_disabled", priority: 1, direction: "outbound", calledNumber: "+15550101000", trunkId: "trunk_disabled" },
      { ruleId: "rule_healthy", priority: 2, direction: "outbound", agentId: "agent_1", preferredRegion: "us-east", trunkId: "trunk_healthy" },
    ],
  });

  assert.deepEqual(result, {
    policyVersion: "policy_v1",
    selected: { ruleId: "rule_healthy", trunkId: "trunk_healthy", region: "us-east" },
    rejected: [{ ruleId: "rule_disabled", reason: "trunk_disabled" }],
  });
});

test("routing dry-run reports rejected alternatives when no route is eligible", () => {
  const result = dryRunRoutingPolicy({
    policyVersion: "policy_v1",
    input: { direction: "inbound", calledNumber: "+15550101000" },
    trunks: [{ trunkId: "trunk_1", provider: "generic_sip", direction: "egress", health: "healthy", capacityAvailable: false }],
    rules: [{ ruleId: "rule_1", priority: 1, direction: "inbound", trunkId: "trunk_1" }],
  });

  assert.deepEqual(result, {
    policyVersion: "policy_v1",
    rejected: [{ ruleId: "rule_1", reason: "trunk_direction_mismatch" }],
  });
});

test("SIP trunk redaction never returns credential material", () => {
  assert.deepEqual(
    redactSipTrunk({
      trunkId: "trunk_1",
      provider: "generic_sip",
      direction: "both",
      health: "healthy",
      capacityAvailable: true,
      username: "carrier-user",
      passwordSecretRef: "secret_password",
      certificateSecretRef: "secret_cert",
    }),
    {
      trunkId: "trunk_1",
      provider: "generic_sip",
      direction: "both",
      health: "healthy",
      capacityAvailable: true,
      username: "[configured]",
      passwordSecretRef: "[secret-ref]",
      certificateSecretRef: "[secret-ref]",
    },
  );
});
