import { apiClient } from "@/src/lib/api/client";
import type {
  AgentMcpConnection,
  ApiEnvelope,
  McpCatalogPage,
  McpConnection,
  McpAccessTestResult,
} from "@/src/lib/api/types";

export interface ConnectMcpInput {
  catalogSlug?: string;
  customUrl?: string;
  authMode?: "oauth" | "api_key" | "none";
  discoveryUrl?: string;
  displayName?: string;
}

export interface McpCatalogParams {
  page?: number;
  pageSize?: number;
  search?: string;
  verified?: boolean;
  sort?: "popular" | "name";
}

const normalizeConnection = (connection: McpConnection): McpConnection => ({
  ...connection,
  tools: Array.isArray(connection.tools) ? connection.tools : [],
});

export const mcpApi = {
  catalog: async (params: McpCatalogParams = {}): Promise<McpCatalogPage> => {
    const res = await apiClient.get<ApiEnvelope<McpCatalogPage>>("/mcp/catalog", { params });
    return res.data.data;
  },
  connections: async (): Promise<McpConnection[]> => {
    const res = await apiClient.get<ApiEnvelope<McpConnection[]>>("/mcp/connections");
    return res.data.data.map(normalizeConnection);
  },
  connect: async (input: ConnectMcpInput): Promise<McpConnection> => {
    const res = await apiClient.post<ApiEnvelope<McpConnection>>("/mcp/connections", input);
    return normalizeConnection(res.data.data);
  },
  refresh: async (mcpConnectionId: string): Promise<McpConnection> => {
    const res = await apiClient.post<ApiEnvelope<McpConnection>>(`/mcp/connections/${mcpConnectionId}/refresh`);
    return normalizeConnection(res.data.data);
  },
  testAccess: async (id: string, toolName: string, args: Record<string, unknown>): Promise<McpAccessTestResult> => {
    const res = await apiClient.post<ApiEnvelope<McpAccessTestResult>>(`/mcp/connections/${id}/test`, {
      toolName, arguments: args,
    });
    return res.data.data;
  },
  disconnect: async (mcpConnectionId: string): Promise<void> => {
    await apiClient.delete(`/mcp/connections/${mcpConnectionId}`);
  },
  agentConnections: async (agentId: string): Promise<AgentMcpConnection[]> => {
    const res = await apiClient.get<ApiEnvelope<AgentMcpConnection[]>>(`/mcp/agent/${agentId}`);
    return res.data.data;
  },
  attach: async (mcpConnectionId: string, agentId: string): Promise<void> => {
    await apiClient.post(`/mcp/connections/${mcpConnectionId}/attach/${agentId}`, { enabled: true });
  },
  detach: async (mcpConnectionId: string, agentId: string): Promise<void> => {
    await apiClient.delete(`/mcp/connections/${mcpConnectionId}/detach/${agentId}`);
  },
};
