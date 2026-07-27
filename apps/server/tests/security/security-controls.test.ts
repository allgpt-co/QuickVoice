import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCanonicalAuditEvent,
  buildIntegrityCheckpoint,
  evaluateSecretUse,
  evaluateToolSecurityPolicy,
  redactAuditDiff,
  type ToolSecurityPolicy,
} from "../../src/modules/security/security-controls.js";

const policy: ToolSecurityPolicy = {
  policyId: "tool_pol_1",
  organizationId: "org_1",
  allowedDestinations: ["api.example.com"],
  allowedDataClasses: ["metadata", "summary"],
  deniedActions: ["delete_customer"],
  maxCostCents: 50,
  requireIdempotencyForWrites: true,
  riskDecisions: { read: "allow", write: "approve", destructive: "deny", unknown: "deny" },
};

test("canonical audit events redact sensitive diffs and produce stable integrity material", () => {
  const event = buildCanonicalAuditEvent({
    category: "secret",
    organizationId: "org_1",
    actor: { type: "user", id: "user_1" },
    action: "secret.rotate",
    resource: { type: "secret", id: "sec_1", version: "2" },
    result: "success",
    source: "api",
    correlationId: "corr_1",
    occurredAt: "2026-07-26T00:00:00.000Z",
    diff: { apiToken: "leak", nested: { phoneNumber: "+15550101000", safe: "ok" } },
  });

  assert.match(event.eventId, /^aud_[a-f0-9]{16}$/);
  assert.deepEqual(event.diff, { apiToken: "[redacted]", nested: { phoneNumber: "[redacted]", safe: "ok" } });
  assert.deepEqual(redactAuditDiff({ email: "a@example.com", safe: true }), { email: "[redacted]", safe: true });
  assert.equal(buildIntegrityCheckpoint([event]).count, 1);
});

test("secret usage fails closed on state, expiry, tenant, environment, and tool scope", () => {
  assert.deepEqual(evaluateSecretUse({ secretId: "sec_1", organizationId: "org_1", scope: "agent", purpose: "webhook", state: "active", version: 1, allowedEnvironments: ["prod"], allowedTools: ["tool_1"], usageCount: 0 }, { organizationId: "org_1", environment: "prod", toolId: "tool_1", now: "2026-07-26T00:00:00.000Z" }), { allowed: true, reasons: [] });
  assert.deepEqual(evaluateSecretUse({ secretId: "sec_1", organizationId: "org_1", scope: "agent", purpose: "webhook", state: "revoked", version: 1, allowedEnvironments: ["dev"], allowedTools: ["tool_2"], expiresAt: "2026-07-25T00:00:00.000Z", usageCount: 0 }, { organizationId: "org_2", environment: "prod", toolId: "tool_1", now: "2026-07-26T00:00:00.000Z" }).reasons, ["organization mismatch", "secret state is revoked", "secret expired", "environment not allowed", "tool not allowed"]);
});

test("tool security policy enforces destination, data class, cost, idempotency, and risk decisions after model output", () => {
  assert.deepEqual(evaluateToolSecurityPolicy(policy, { organizationId: "org_1", action: "update_ticket", risk: "write", destination: "api.example.com", dataClasses: ["summary"], estimatedCostCents: 10, idempotencyKey: "idem" }), { allowed: true, decision: "approve", reasons: [] });
  assert.deepEqual(evaluateToolSecurityPolicy(policy, { organizationId: "org_2", action: "delete_customer", risk: "destructive", destination: "127.0.0.1", dataClasses: ["transcript"], estimatedCostCents: 99 }).reasons, [
    "organization mismatch",
    "action denied",
    "destination not allowed",
    "private destination blocked",
    "data class not allowed: transcript",
    "estimated cost exceeds policy",
    "idempotency key required",
    "risk denied: destructive",
  ]);
});
