import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildExportManifest,
  checksumExportRecord,
  planRestore,
  updateIncrementalWatermark,
  validateExportManifest,
  validateExportSelection,
} from "../../src/modules/data-portability/export-manifest.js";

const checksum = "a".repeat(64);
const manifest = buildExportManifest({
  exportId: "exp_1",
  organizationId: "org_1",
  selection: { resourceTypes: ["agents", "calls"], from: "2026-07-01T00:00:00.000Z", to: "2026-07-26T00:00:00.000Z" },
  createdAt: "2026-07-26T00:00:00.000Z",
  watermark: "2026-07-26T00:00:00.000Z",
  consistencyModel: "watermark",
  artifacts: [{ path: "agents/part-0001.jsonl", resourceType: "agents", format: "jsonl", recordCount: 2, bytes: 100, checksumSha256: checksum }],
  omissions: ["secret values omitted"],
  encrypted: true,
  restoreCompatibility: { minSchemaVersion: 1, maxSchemaVersion: 1 },
});

test("export selection validation requires resources, date order, and flags sensitive metadata exports", () => {
  assert.deepEqual(validateExportSelection(manifest.selection), []);
  assert.deepEqual(validateExportSelection({ resourceTypes: ["billing"], from: "2026-07-26T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" }), ["from must be before to", "billing exports are metadata-only and require elevated approval"]);
  assert.deepEqual(validateExportSelection({ resourceTypes: [] }), ["at least one resource type must be selected"]);
});

test("export manifest validation enforces encryption, checksums, paths, and restore compatibility", () => {
  assert.deepEqual(validateExportManifest(manifest, 1), []);
  assert.deepEqual(validateExportManifest({ ...manifest, encrypted: false, artifacts: [{ ...manifest.artifacts[0], path: "../escape", checksumSha256: "bad" }], restoreCompatibility: { minSchemaVersion: 2, maxSchemaVersion: 3 } }, 1), ["export is incompatible with current restore schema", "export artifacts must be encrypted", "unsafe artifact path ../escape", "artifact ../escape has invalid checksum"]);
});

test("restore planning is dry-run first and never destructively updates without confirmation", () => {
  assert.deepEqual(planRestore({ manifest, conflictModes: { agents: "create_new" }, currentSchemaVersion: 1 }).status, "ready");
  assert.deepEqual(planRestore({ manifest, conflictModes: { agents: "update_supported" }, currentSchemaVersion: 1 }).status, "needs_confirmation");
});

test("export checksums and incremental watermarks are deterministic", () => {
  assert.equal(checksumExportRecord({ b: 2, a: 1 }), checksumExportRecord({ a: 1, b: 2 }));
  assert.equal(updateIncrementalWatermark("2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"), "2026-07-02T00:00:00.000Z");
});
