import { dashboardMetricRegistry } from "../dashboard/dashboard.metrics.js";

export type AnalyticsVisualization = "kpi" | "table" | "line" | "bar" | "funnel" | "cohort";
export type AnalyticsVisibility = "private" | "team";
export type AnalyticsQueryStatus = "ready" | "async_required" | "invalid";

export type AnalyticsFilter = {
  from: string;
  to: string;
  timezone: string;
  agentId?: string;
  campaignId?: string;
  direction?: "inbound" | "outbound";
  phoneNumberId?: string;
  provider?: string;
  outcome?: string;
  environmentId?: string;
};

export type SavedReportDefinition = {
  name: string;
  ownerUserId: string;
  organizationId: string;
  visibility: AnalyticsVisibility;
  filters: AnalyticsFilter;
  measures: string[];
  dimensions: string[];
  visualization: AnalyticsVisualization;
  comparison?: "previous_period" | "none";
  schedule?: {
    frequency: "daily" | "weekly" | "monthly";
    recipientUserIds: string[];
  };
};

export type AnalyticsQueryPlan = {
  status: AnalyticsQueryStatus;
  metricIds: string[];
  dimensions: string[];
  warnings: string[];
  asyncReason?: string;
};

const CANONICAL_METRIC_IDS = new Set(Object.values(dashboardMetricRegistry).map((metric) => metric.id));
const ALLOWED_DIMENSIONS = new Set([
  "agent_id",
  "campaign_id",
  "direction",
  "phone_number_id",
  "provider",
  "outcome",
  "environment_id",
  "day",
  "week",
]);

export function planAnalyticsReport(definition: SavedReportDefinition): AnalyticsQueryPlan {
  const warnings: string[] = [];
  const metricIds = [...new Set(definition.measures)];
  const dimensions = [...new Set(definition.dimensions)];

  for (const metricId of metricIds) {
    if (!CANONICAL_METRIC_IDS.has(metricId)) warnings.push(`unknown canonical metric: ${metricId}`);
  }
  for (const dimension of dimensions) {
    if (!ALLOWED_DIMENSIONS.has(dimension)) warnings.push(`unsupported dimension: ${dimension}`);
  }
  if (new Date(definition.filters.from).getTime() >= new Date(definition.filters.to).getTime()) {
    warnings.push("filter range must have from before to");
  }
  if (definition.schedule && definition.schedule.recipientUserIds.length === 0) {
    warnings.push("scheduled reports require at least one recipient");
  }

  if (warnings.length > 0) return { status: "invalid", metricIds, dimensions, warnings };

  const highCardinality = dimensions.length > 2;
  const scheduledExport = Boolean(definition.schedule);
  if (highCardinality || scheduledExport) {
    return {
      status: "async_required",
      metricIds,
      dimensions,
      warnings,
      asyncReason: highCardinality ? "more than two breakdown dimensions" : "scheduled export delivery",
    };
  }

  return { status: "ready", metricIds, dimensions, warnings };
}

export function buildSavedReportLink({ reportId, organizationId }: { reportId: string; organizationId: string }) {
  return `/reports/${encodeURIComponent(reportId)}?org=${encodeURIComponent(organizationId)}`;
}
