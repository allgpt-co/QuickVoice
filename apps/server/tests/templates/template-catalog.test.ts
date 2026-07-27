import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTemplateInstallationPlan,
  digestTemplateVersion,
  listDiscoverableTemplateVersions,
  threeWayTemplateDiff,
  validateTemplateVersion,
  type TemplateVersion,
} from "../../src/modules/templates/template-catalog.js";

const version: TemplateVersion = {
  templateId: "dental_front_desk",
  versionId: "tplv_1",
  version: "1.0.0",
  status: "published",
  publisher: "QuickVoice",
  supportLevel: "official",
  industries: ["healthcare"],
  useCases: ["appointment_scheduling"],
  locales: ["en-US"],
  channels: ["phone"],
  requiredProviders: ["deepgram", "anthropic"],
  requiredPermissions: ["agents:create"],
  compatibility: { minSchemaVersion: 1, maxSchemaVersion: 1 },
  changelog: "Initial release",
  license: "QuickVoice Template Terms",
  package: {
    setupSteps: ["Connect a phone number"],
    warnings: ["Configure local consent language"],
    resources: [{ logicalKey: "agent.main", kind: "agent", content: { name: "Dental front desk", webhookUrl: "https://example.com/hook" } }],
  },
};

test("template catalog discovery only includes reviewed published versions", () => {
  assert.deepEqual(listDiscoverableTemplateVersions([version, { ...version, versionId: "tplv_2", status: "draft" }]).map((item) => item.versionId), ["tplv_1"]);
});

test("template validation rejects incompatible schemas, unverified published templates, secrets, and unsafe URLs", () => {
  assert.deepEqual(validateTemplateVersion(version, 1), []);
  assert.deepEqual(
    validateTemplateVersion({
      ...version,
      supportLevel: "community",
      compatibility: { minSchemaVersion: 2, maxSchemaVersion: 3 },
      package: { ...version.package, resources: [{ logicalKey: "agent.main", kind: "agent", content: { apiSecret: "leak", webhookUrl: "http://unsafe.test" } }] },
    }, 1),
    [
      "published templates must be verified or official",
      "template is incompatible with current schema version",
      "template content contains forbidden field agent.main.apiSecret",
      "template content contains unsafe URL at agent.main.webhookUrl",
    ],
  );
});

test("template installation plans are idempotent, organization-owned, and non-billable", () => {
  const first = buildTemplateInstallationPlan({ organizationId: "org_1", version, idempotencyKey: "idem" });
  const second = buildTemplateInstallationPlan({ organizationId: "org_1", version, idempotencyKey: "idem" });

  assert.equal(second.installationId, first.installationId);
  assert.equal(first.contentDigest, digestTemplateVersion(version));
  assert.equal(first.billableSideEffects, false);
  assert.deepEqual(first.creates, [{ logicalKey: "agent.main", kind: "agent", organizationOwned: true }]);
});

test("template updates produce three-way decisions without silently overwriting local edits", () => {
  const diff = threeWayTemplateDiff({
    baseline: [{ path: "agent.prompt", value: "hello" }, { path: "agent.voice", value: "old" }],
    local: [{ path: "agent.prompt", value: "custom hello" }, { path: "agent.voice", value: "old" }],
    proposed: [{ path: "agent.prompt", value: "new hello" }, { path: "agent.voice", value: "new" }],
  });

  assert.deepEqual(diff.map((item) => [item.path, item.decision]), [
    ["agent.prompt", "manual_conflict"],
    ["agent.voice", "accept_update"],
  ]);
});
