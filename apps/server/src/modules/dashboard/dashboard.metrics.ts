export const dashboardMetricRegistry = {
  calls: {
    id: "calls_total",
    unit: "count",
    description: "All inbound and outbound call records in the selected reporting window.",
    timestampBasis: "call.startTime",
  },
  minutes: {
    id: "minutes_used",
    unit: "minutes",
    description: "Rounded connected conversation minutes in the selected reporting window.",
    timestampBasis: "call.startTime",
  },
  avgDurationSeconds: {
    id: "avg_duration_seconds",
    unit: "seconds",
    description: "Average call duration across records in the selected reporting window.",
    timestampBasis: "call.startTime",
  },
  successRate: {
    id: "success_rate",
    unit: "ratio",
    description: "Completed calls divided by all calls in the selected reporting window.",
    timestampBasis: "call.startTime",
  },
  failedCalls: {
    id: "failed_calls",
    unit: "count",
    description: "Calls with FAILED status in the selected reporting window.",
    timestampBasis: "call.startTime",
  },
  missedCalls: {
    id: "missed_calls",
    unit: "count",
    description: "Calls with NOT_ANSWERED status in the selected reporting window.",
    timestampBasis: "call.startTime",
  },
} as const;

export type DashboardMetricKey = keyof typeof dashboardMetricRegistry;
