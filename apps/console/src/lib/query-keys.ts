import type { CallListParams } from "@/src/lib/api/resources/calls";
import type { DashboardSummaryParams } from "@/src/lib/api/resources/dashboard";

export const queryKeys = {
  agents: {
    all: ["agents"] as const,
    list: () => [...queryKeys.agents.all, "list"] as const,
    detail: (id: string) => [...queryKeys.agents.all, "detail", id] as const,
    config: (id: string) => [...queryKeys.agents.all, "config", id] as const,
    previewSession: (id: string) =>
      [...queryKeys.agents.all, "previewSession", id] as const,
    voiceCatalog: () => [...queryKeys.agents.all, "voiceCatalog"] as const,
    widgets: (agentId: string) =>
      [...queryKeys.agents.all, "widgets", agentId] as const,
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
    transcript: (id: string) =>
      [...queryKeys.calls.all, "transcript", id] as const,
    live: () => [...queryKeys.calls.all, "live"] as const,
  },
  outbound: {
    all: ["outbound"] as const,
    quick: () => [...queryKeys.outbound.all, "quick"] as const,
    batches: (agentId?: string) =>
      [...queryKeys.outbound.all, "batches", agentId ?? null] as const,
  },
  kb: {
    all: ["kb"] as const,
    list: (agentId?: string) =>
      [...queryKeys.kb.all, "list", agentId ?? null] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    summary: (params: DashboardSummaryParams) =>
      [...queryKeys.dashboard.all, "summary", params] as const,
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
    summary: (organizationId: string | null) =>
      [...queryKeys.billing.all, "summary", organizationId] as const,
    transactions: (organizationId: string | null) =>
      [...queryKeys.billing.all, "transactions", organizationId] as const,
  },
  tools: {
    all: ["tools"] as const,
    list: () => [...queryKeys.tools.all, "list"] as const,
    detail: (id: string) => [...queryKeys.tools.all, "detail", id] as const,
    agentTools: (agentId: string) =>
      [...queryKeys.tools.all, "agent", agentId] as const,
  },
  secrets: {
    all: ["secrets"] as const,
    list: () => [...queryKeys.secrets.all, "list"] as const,
  },
  mcp: {
    all: ["mcp"] as const,
    catalog: (params?: unknown) =>
      [...queryKeys.mcp.all, "catalog", params ?? {}] as const,
    connections: () => [...queryKeys.mcp.all, "connections"] as const,
    agentConnections: (agentId: string) =>
      [...queryKeys.mcp.all, "agent", agentId] as const,
  },
};
