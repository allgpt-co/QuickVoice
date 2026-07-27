import { apiClient } from "@/src/lib/api/client";
import type { ApiEnvelope, CallLog, CallStatus } from "@/src/lib/api/types";

export type DashboardRange = "24h" | "7d" | "30d" | "custom";

export interface DashboardTotals {
  calls: number;
  minutes: number;
  avgDurationSeconds: number;
  successRate: number;
  failedCalls: number;
  missedCalls: number;
}

export interface DashboardSeriesPoint {
  t: string;
  calls: number;
  minutes: number;
  completed: number;
  failed: number;
  missed: number;
  successRate: number;
}

export interface StatusBreakdownPoint {
  status: CallStatus;
  count: number;
}

export interface DirectionBreakdownPoint {
  direction: "inbound" | "outbound" | "unknown";
  count: number;
}

export interface AgentBucket {
  agentId: string | null;
  calls: number;
  minutes: number;
  successRate: number;
}

export interface DashboardMetricDefinition {
  id: string;
  unit: "count" | "minutes" | "seconds" | "ratio";
  description: string;
  timestampBasis: string;
}

export interface DashboardSummary {
  range: DashboardRange;
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  totals: DashboardTotals;
  metrics?: Record<keyof DashboardTotals, DashboardMetricDefinition>;
  deltas: DashboardTotals;
  series: DashboardSeriesPoint[];
  statusBreakdown: StatusBreakdownPoint[];
  directionBreakdown: DirectionBreakdownPoint[];
  topAgents: AgentBucket[];
  recent: CallLog[];
}

export interface DashboardSummaryParams {
  range: DashboardRange;
  from?: string;
  to?: string;
}

export async function getDashboardSummary(
  params: DashboardSummaryParams
): Promise<DashboardSummary> {
  const res = await apiClient.get<ApiEnvelope<DashboardSummary>>(
    "/dashboard/summary",
    { params }
  );
  return res.data.data;
}
