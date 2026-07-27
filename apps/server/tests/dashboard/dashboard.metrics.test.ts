import assert from "node:assert/strict";
import { test } from "node:test";

import { dashboardMetricRegistry } from "../../src/modules/dashboard/dashboard.metrics.js";

test("dashboard metric registry exposes stable ids and definitions for every total", () => {
  assert.deepEqual(Object.keys(dashboardMetricRegistry), [
    "calls",
    "minutes",
    "avgDurationSeconds",
    "successRate",
    "failedCalls",
    "missedCalls",
  ]);

  const ids = Object.values(dashboardMetricRegistry).map((metric) => metric.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[a-z][a-z0-9_]*$/.test(id)));
  assert.ok(
    Object.values(dashboardMetricRegistry).every(
      (metric) =>
        metric.description.length > 20 && metric.timestampBasis === "call.startTime"
    )
  );
});
