import { apiClient } from "@/src/lib/api/client";
import type {
  AgentFlow,
  AgentFlowGraph,
  ApiEnvelope,
} from "@/src/lib/api/types";

export interface CreateFlowInput {
  rootAgentId: string;
  name: string;
  description?: string;
  graphJson: AgentFlowGraph;
  isActive?: boolean;
}

export interface UpdateFlowInput {
  rootAgentId?: string;
  name?: string;
  description?: string;
  graphJson?: AgentFlowGraph;
  isActive?: boolean;
}

export interface FlowTestRunMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FlowTestRunInput {
  messages: FlowTestRunMessage[];
}

export interface FlowTestRunResult {
  success: boolean;
  path: unknown[];
  selectedRoutes: unknown[];
  warnings: string[];
}

export const flowsApi = {
  list: async (rootAgentId?: string): Promise<AgentFlow[]> => {
    const res = await apiClient.get<ApiEnvelope<AgentFlow[]>>("/flows", {
      params: rootAgentId ? { rootAgentId } : undefined,
    });
    return res.data.data;
  },
  create: async (input: CreateFlowInput): Promise<AgentFlow> => {
    const res = await apiClient.post<ApiEnvelope<AgentFlow>>("/flows", input);
    return res.data.data;
  },
  update: async (flowId: string, input: UpdateFlowInput): Promise<AgentFlow> => {
    const res = await apiClient.patch<ApiEnvelope<AgentFlow>>(`/flows/${flowId}`, input);
    return res.data.data;
  },
  remove: async (flowId: string): Promise<void> => {
    await apiClient.delete(`/flows/${flowId}`);
  },
  testRun: async (flowId: string, input: FlowTestRunInput): Promise<FlowTestRunResult> => {
    const res = await apiClient.post<ApiEnvelope<FlowTestRunResult>>(
      `/flows/${flowId}/test-runs`,
      input
    );
    return res.data.data;
  },
};
