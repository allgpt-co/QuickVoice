import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUICKVOICE_ROADMAP_EPICS,
  QUICKVOICE_ROADMAP_ISSUE,
  ROADMAP_CROSS_CUTTING_CONTROLS,
  findRoadmapEpicForChild,
  summarizeRoadmapCoverage,
} from "../../src/modules/roadmap/product-roadmap.js";

test("roadmap issue maps every child epic and all linked product issues", () => {
  assert.equal(QUICKVOICE_ROADMAP_ISSUE, 76);
  assert.deepEqual(QUICKVOICE_ROADMAP_EPICS.map((epic) => epic.issue), [77, 78, 79, 80, 81, 82, 83, 84]);
  assert.equal(QUICKVOICE_ROADMAP_EPICS.reduce((sum, epic) => sum + epic.childIssues.length, 0), 39);
  assert.equal(findRoadmapEpicForChild(124)?.area, "campaigns");
});

test("roadmap coverage summary identifies covered, partial, and not-started epics", () => {
  assert.deepEqual(summarizeRoadmapCoverage([85, 87, 89, 91, 95]).find((epic) => epic.issue === 84)?.status, "covered");
  assert.deepEqual(summarizeRoadmapCoverage([86]).find((epic) => epic.issue === 77)?.status, "partial");
  assert.deepEqual(summarizeRoadmapCoverage([]).find((epic) => epic.issue === 81)?.status, "not_started");
});

test("cross-cutting roadmap controls preserve product safety principles", () => {
  const requiredControls = ["organization_scoped_authorization", "idempotent_mutations", "zero_pii_and_retention", "documented_api_event_contracts"] as const;
  for (const control of requiredControls) {
    assert.ok(ROADMAP_CROSS_CUTTING_CONTROLS.includes(control));
  }
});
