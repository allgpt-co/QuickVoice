import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSavedReportLink, planAnalyticsReport } from "../../src/modules/analytics/report-contract.js";

const baseReport = {
  name: "Operations overview",
  ownerUserId: "user_1",
  organizationId: "org_1",
  visibility: "team" as const,
  filters: {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-26T00:00:00.000Z",
    timezone: "America/Chicago",
  },
  measures: ["calls_total", "success_rate"],
  dimensions: ["agent_id", "direction"],
  visualization: "table" as const,
};

test("analytics reports use canonical metric ids and reusable filters", () => {
  assert.deepEqual(planAnalyticsReport(baseReport), {
    status: "ready",
    metricIds: ["calls_total", "success_rate"],
    dimensions: ["agent_id", "direction"],
    warnings: [],
  });
});

test("analytics report planner rejects unknown formulas and invalid date ranges", () => {
  const plan = planAnalyticsReport({
    ...baseReport,
    filters: { ...baseReport.filters, from: "2026-07-26T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
    measures: ["made_up_metric"],
    dimensions: ["agent_id", "transcript_text"],
  });

  assert.equal(plan.status, "invalid");
  assert.deepEqual(plan.warnings, [
    "unknown canonical metric: made_up_metric",
    "unsupported dimension: transcript_text",
    "filter range must have from before to",
  ]);
});

test("analytics report planner marks high-cardinality and scheduled reports asynchronous", () => {
  assert.equal(
    planAnalyticsReport({ ...baseReport, dimensions: ["agent_id", "direction", "provider"] }).asyncReason,
    "more than two breakdown dimensions",
  );
  assert.equal(
    planAnalyticsReport({
      ...baseReport,
      schedule: { frequency: "weekly", recipientUserIds: ["user_1"] },
    }).asyncReason,
    "scheduled export delivery",
  );
});

test("saved report links preserve organization scope without embedding filters", () => {
  assert.equal(buildSavedReportLink({ reportId: "report 1", organizationId: "org/1" }), "/reports/report%201?org=org%2F1");
});
