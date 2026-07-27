import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CURATED_STARTER_PACK_ROADMAP,
  summarizeStarterPackCoverage,
  validateStarterPackSpec,
  type StarterPackSpec,
} from "../../src/modules/templates/starter-pack-spec.js";

test("curated starter-pack roadmap accounts for every required vertical and horizontal category", () => {
  const coverage = summarizeStarterPackCoverage(CURATED_STARTER_PACK_ROADMAP);

  assert.equal(coverage.total, 19);
  assert.equal(coverage.reviewed, 1);
  assert.equal(coverage.allCategoriesAccountedFor, true);
  assert.ok(CURATED_STARTER_PACK_ROADMAP.some((pack) => pack.packId === "healthcare_dental_scheduling"));
  assert.ok(CURATED_STARTER_PACK_ROADMAP.some((pack) => pack.packId === "horizontal_after_hours"));
});

test("starter pack specs require placeholders, synthetic fixtures, review evidence, and no forbidden claims", () => {
  const reviewed = CURATED_STARTER_PACK_ROADMAP[0] as StarterPackSpec;
  assert.deepEqual(validateStarterPackSpec(reviewed), []);

  assert.deepEqual(validateStarterPackSpec({
    ...reviewed,
    packId: "",
    placeholders: [],
    syntheticFixtureIds: ["real_customer_call_1"],
    review: { ...reviewed.review, accessibility: false },
    complianceWarnings: ["This pack is guaranteed compliant."],
  }), [
    "pack identity fields are required",
    "placeholders must not be empty",
    "fixtures must be explicitly synthetic",
    "reviewed packs require all review approvals",
    "pack contains forbidden claim or sensitive data pattern",
  ]);
});
