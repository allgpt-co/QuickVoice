import type { CallListParams } from "@/src/lib/api/resources/calls";
import type { DashboardRange } from "@/src/lib/api/resources/dashboard";

export const queryKeys = {
  agents: {
    all: ["agents"] as const,
    list: () => [...queryKeys.agents.all, "list"] as const,
    detail: (id: string) => [...queryKeys.agents.all, "detail", id] as const,
    config: (id: string) => [...queryKeys.agents.all, "config", id] as const,
  },
  flows: {
    all: ["flows"] as const,
    list: (rootAgentId?: string) =>
      [...queryKeys.flows.all, "list", rootAgentId ?? null] as const,
    detail: (flowId: string) => [...queryKeys.flows.all, "detail", flowId] as const,
  },
  numbers: {
    all: ["numbers"] as const,
    list: () => [...queryKeys.numbers.all, "list"] as const,
    search: (p: Record<string, unknown>) =>
      [...queryKeys.numbers.all, "search", p] as const,
  },
  calls: {
    all: ["calls"] as const,
    list: (params: CallListParams) =>
      [...queryKeys.calls.all, "list", params] as const,
    detail: (id: string) => [...queryKeys.calls.all, "detail", id] as const,
    transcript: (id: string) => [...queryKeys.calls.all, "transcript", id] as const,
  },
  outbound: {
    all: ["outbound"] as const,
    quick: () => [...queryKeys.outbound.all, "quick"] as const,
    batches: (agentId?: string) =>
      [...queryKeys.outbound.all, "batches", agentId ?? null] as const,
  },
  kb: {
    all: ["kb"] as const,
    list: (agentId?: string) => [...queryKeys.kb.all, "list", agentId ?? null] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    summary: (range: DashboardRange) =>
      [...queryKeys.dashboard.all, "summary", range] as const,
  },
  org: {
    all: ["org"] as const,
    members: () => [...queryKeys.org.all, "members"] as const,
    invitations: () => [...queryKeys.org.all, "invitations"] as const,
  },
  apiKeys: {
    all: ["apiKeys"] as const,
    list: () => [...queryKeys.apiKeys.all, "list"] as const,
  },
  billing: {
    all: ["billing"] as const,
    subscription: () => [...queryKeys.billing.all, "subscription"] as const,
    usage: () => [...queryKeys.billing.all, "usage"] as const,
  },
  tools: {
    all: ["tools"] as const,
    list: () => [...queryKeys.tools.all, "list"] as const,
    detail: (id: string) => [...queryKeys.tools.all, "detail", id] as const,
    agentTools: (agentId: string) => [...queryKeys.tools.all, "agent", agentId] as const,
  },
  mcp: {
    all: ["mcp"] as const,
    catalog: (params?: unknown) =>
      [...queryKeys.mcp.all, "catalog", params ?? {}] as const,
    connections: () => [...queryKeys.mcp.all, "connections"] as const,
    agentConnections: (agentId: string) => [...queryKeys.mcp.all, "agent", agentId] as const,
  },
};
