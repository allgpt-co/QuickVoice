import type { CallStatus } from "@/src/lib/api/types";
import type { DashboardRange } from "@/src/lib/api/resources/dashboard";

export function dashboardCallsHref({
  range,
  status,
  agentId,
}: {
  range: DashboardRange;
  status?: CallStatus;
  agentId?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("range", range);
  if (status) params.set("status", status);
  if (agentId) params.set("agentId", agentId);

  return `/calls?${params.toString()}`;
}
