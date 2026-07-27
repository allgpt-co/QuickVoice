import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRecoveryExerciseEvidence,
  detectDeploymentProfileDrift,
  evaluateBackupRun,
  evaluateSloMeasurement,
  validateDeploymentProfile,
  type DeploymentProfile,
} from "../../src/modules/enterprise/deployment-evidence.js";

const profile: DeploymentProfile = {
  profileId: "prof_1",
  version: 1,
  organizationId: "org_1",
  requestedRegions: ["us-east-1"],
  components: [
    { componentId: "api", kind: "control_plane", region: "us-east-1", status: "supported", source: "aws", observedAt: "2026-07-26T00:00:00.000Z", dataClasses: ["metadata"] },
    { componentId: "secrets", kind: "database", region: "us-east-1", status: "supported", source: "config", observedAt: "2026-07-26T00:00:00.000Z", dataClasses: ["secrets"], encryptionProfileId: "enc_1" },
  ],
};

test("deployment profile validation separates supported, unknown, out-of-region, and encryption gaps", () => {
  assert.deepEqual(validateDeploymentProfile(profile), []);
  assert.deepEqual(validateDeploymentProfile({ ...profile, components: [{ componentId: "llm", kind: "external_provider", region: "eu-west-1", status: "supported", source: "provider", observedAt: "now", dataClasses: ["transcript"] }, { componentId: "secret_db", kind: "database", status: "unknown", source: "config", observedAt: "now", dataClasses: ["secrets"] }] }), ["llm is outside requested regions", "secret_db residency is unknown", "secret_db requires an encryption profile for secrets"]);
});

test("deployment drift captures material boundary changes", () => {
  assert.deepEqual(detectDeploymentProfileDrift(profile, { ...profile, components: [{ ...profile.components[0], region: "us-west-2", status: "customer_attested" }, profile.components[1], { componentId: "backup", kind: "backup", region: "us-east-1", status: "supported", source: "aws", observedAt: "now", dataClasses: ["backups"] }] }), [
    { componentId: "api", kind: "changed", changes: ["region", "status"] },
    { componentId: "backup", kind: "added" },
  ]);
});

test("backups are not verified until coverage, encryption, manifest, and integrity checks pass", () => {
  assert.deepEqual(evaluateBackupRun({ backupRunId: "bak_1", startedAt: "now", completedAt: "later", encrypted: true, manifestChecksum: "abc", coveredDataClasses: ["metadata", "contacts"], requiredDataClasses: ["metadata", "contacts"], integrityVerifiedAt: "later" }).status, "verified");
  assert.deepEqual(evaluateBackupRun({ backupRunId: "bak_1", startedAt: "now", completedAt: "later", encrypted: false, coveredDataClasses: ["metadata"], requiredDataClasses: ["metadata", "contacts"] }), { status: "incomplete", missingCoverage: ["contacts"], encrypted: false, integrityVerified: false });
});

test("SLO and recovery evidence distinguish target, observed result, gaps, and exercises", () => {
  assert.deepEqual(evaluateSloMeasurement({ sliId: "api_availability", target: 0.99, observed: 0.98, windowStart: "a", windowEnd: "b", dataGap: false }).status, "burning");
  assert.deepEqual(evaluateSloMeasurement({ sliId: "api_availability", target: 0.99, observed: 0.98, windowStart: "a", windowEnd: "b", dataGap: true }), { status: "unknown", reason: "data_gap", burn: null });
  assert.deepEqual(buildRecoveryExerciseEvidence({ exerciseId: "dr_1", targetRtoMinutes: 60, targetRpoMinutes: 15, observedRtoMinutes: 45, observedRpoMinutes: 20, validationPassed: true, gaps: ["provider failback manual"] }), { exerciseId: "dr_1", exercised: true, rtoStatus: "met", rpoStatus: "missed", gaps: ["provider failback manual"] });
});
