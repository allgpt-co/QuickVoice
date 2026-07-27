import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBlueprintImportDryRun,
  digestBlueprintPackage,
  evaluateShareGrantAccess,
  validateBlueprintPackage,
  verifyBlueprintTrust,
  type BlueprintPackage,
} from "../../src/modules/blueprints/blueprint-package.js";

const pkg: BlueprintPackage = {
  schemaVersion: "quickvoice.blueprint.v1",
  blueprintId: "bp_1",
  publisher: "QuickVoice",
  exportedAt: "2026-07-26T00:00:00.000Z",
  compatibility: { minSchemaVersion: 1, maxSchemaVersion: 1 },
  license: "Example",
  resources: [
    { logicalKey: "agent.main", kind: "agent", digest: "d1", content: { name: "Receptionist" } },
    { logicalKey: "workflow.main", kind: "workflow", digest: "d2", content: { entry: "start" }, dependsOn: ["agent.main"] },
  ],
  requiredCapabilities: ["voice"],
  requiredProviders: ["deepgram"],
  requiredPermissions: ["agents:create"],
  setupInstructions: ["Map secrets"],
  changelog: "Initial export",
};

test("blueprint package validation rejects unsafe logical keys, dependencies, secrets, and URLs", () => {
  assert.deepEqual(validateBlueprintPackage(pkg, 1), []);
  assert.deepEqual(validateBlueprintPackage({ ...pkg, compatibility: { minSchemaVersion: 2, maxSchemaVersion: 3 }, resources: [{ logicalKey: "../secret", kind: "tool", digest: "d", content: { apiToken: "leak", callbackUrl: "http://unsafe.test" }, dependsOn: ["missing"] }] }, 1), [
    "blueprint is incompatible with current schema version",
    "unsafe logical resource key ../secret",
    "blueprint content contains forbidden field ../secret",
    "blueprint content contains forbidden field ../secret.apiToken",
    "blueprint content contains unsafe URL at ../secret.callbackUrl",
    "../secret references missing dependency missing",
  ]);
});

test("blueprint trust status distinguishes unsigned, verified, modified, and revoked packages", () => {
  const digest = digestBlueprintPackage(pkg);
  assert.equal(verifyBlueprintTrust(pkg), "unsigned");
  assert.equal(verifyBlueprintTrust({ ...pkg, signature: { signerId: "quickvoice", digest } }), "verified");
  assert.equal(verifyBlueprintTrust({ ...pkg, signature: { signerId: "quickvoice", digest: "bad" } }), "modified");
  assert.equal(verifyBlueprintTrust({ ...pkg, signature: { signerId: "quickvoice", digest, revokedAt: "2026-07-26T00:00:00.000Z" } }), "revoked");
});

test("blueprint dry-run import is idempotent, draft-only, and non-billable", () => {
  const first = buildBlueprintImportDryRun({ organizationId: "org_1", pkg, selectedMappings: { "agent.main": "agent_existing" }, idempotencyKey: "idem" });
  const second = buildBlueprintImportDryRun({ organizationId: "org_1", pkg, selectedMappings: { "agent.main": "agent_existing" }, idempotencyKey: "idem" });

  assert.equal(second.importJobId, first.importJobId);
  assert.equal(first.billableSideEffects, false);
  assert.equal(first.createsLiveAssignments, false);
  assert.deepEqual(first.inventory.map((item) => [item.logicalKey, item.action]), [["agent.main", "reuse"], ["workflow.main", "create_draft"]]);
});

test("share grants enforce organization, expiry, revocation, permissions, and recipient domains", () => {
  const grant = { grantId: "grant_1", organizationId: "org_1", blueprintDigest: digestBlueprintPackage(pkg), expiresAt: "2026-07-27T00:00:00.000Z", recipientDomains: ["example.com"], permissions: ["download" as const] };

  assert.deepEqual(evaluateShareGrantAccess(grant, { organizationId: "org_1", recipientEmail: "admin@example.com", permission: "download", now: "2026-07-26T00:00:00.000Z" }), { allowed: true, reason: "allowed" });
  assert.deepEqual(evaluateShareGrantAccess(grant, { organizationId: "org_1", recipientEmail: "admin@other.com", permission: "download", now: "2026-07-26T00:00:00.000Z" }), { allowed: false, reason: "recipient_domain_denied" });
});
