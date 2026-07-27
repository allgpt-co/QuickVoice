import { apiClient } from "@/src/lib/api/client";
import type {
  Agent,
  AgentConfiguration,
  AgentPreviewSession,
  ApiEnvelope,
  VoiceCatalog,
} from "@/src/lib/api/types";

// organizationId + userId are injected server-side from the session.
// Do NOT send them from the client — the server strips them.
export interface CreateAgentInput {
  name: string;
  isActive: boolean;
  templateId?: string | null;
}

export interface UpdateAgentInput {
  name?: string;
  isActive?: boolean;
  templateId?: string | null;
}

// Fields accepted by the full agent-configuration endpoint.
export interface ConfigureAgentInput {
  agent_language: string;
  firstMessage: string;
  systemPrompt: string;
  llmModel: string;
  sttModel: string;
  ttsModel: string;
  use_rag: boolean;
  voiceId: string;
  data_needed: Array<{
    id: string;
    type: string;
    name: string;
    description: string;
  }>;
  data_evaluation: Array<{
    id: string;
    name: string;
    criteria: string;
  }>;
  initiation_webhook: WebhookInit | null;
  post_call_webhook: WebhookPost | null;
  variables?: {
    firstMessage: string[];
    systemPrompt: string[];
    placeholders?: Record<string, string>;
  };
  preemptive_generation: boolean;
  ivr_navigation_enabled: boolean;
  timezone: string;
  store_call_audio: boolean;
  zero_pii_retention: boolean;
  conversation_retention_days: number;
}

export interface CreatePreviewSessionInput {
  dynamicVariables?: Record<string, string>;
}

export interface WebhookInit {
  webhook_url: string;
  method: "GET" | "POST";
  dynamic_variables?: Record<string, string>;
  headers?: Record<string, WebhookValue>;
  body?: Record<string, WebhookValue>;
}

export interface WebhookPost {
  webhook_url: string;
  method: "POST";
  headers?: Record<string, WebhookValue>;
  transcript: boolean;
  audio_url: boolean;
}

export interface WebhookValue {
  value: string | null;
  type: "Value" | "Secret";
  redacted?: boolean;
}

export const agentsApi = {
  list: async (): Promise<Agent[]> => {
    const res = await apiClient.get<ApiEnvelope<Agent[]>>("/agents");
    return res.data.data;
  },
  create: async (input: CreateAgentInput): Promise<Agent> => {
    const res = await apiClient.post<ApiEnvelope<Agent>>("/agents", input);
    return res.data.data;
  },
  update: async (id: string, input: UpdateAgentInput): Promise<Agent> => {
    const res = await apiClient.patch<ApiEnvelope<Agent>>(
      `/agents/${id}`,
      input,
    );
    return res.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/agents/${id}`);
  },
  getConfig: async (id: string): Promise<AgentConfiguration | null> => {
    const res = await apiClient.get<ApiEnvelope<AgentConfiguration | null>>(
      `/agents/${id}/config`,
    );
    return res.data.data;
  },
  getVoiceCatalog: async (): Promise<VoiceCatalog> => {
    const res = await apiClient.get<ApiEnvelope<VoiceCatalog>>(
      "/agents/voice/catalog",
    );
    return res.data.data;
  },
  createPreviewSession: async (
    id: string,
    input?: CreatePreviewSessionInput,
  ): Promise<AgentPreviewSession> => {
    const res = await apiClient.post<ApiEnvelope<AgentPreviewSession>>(
      `/agents/${id}/preview-session`,
      input ?? {},
    );
    return res.data.data;
  },
  saveConfig: async (
    id: string,
    input: ConfigureAgentInput,
  ): Promise<AgentConfiguration> => {
    const res = await apiClient.post<ApiEnvelope<AgentConfiguration>>(
      `/agents/${id}/config`,
      input,
    );
    return res.data.data;
  },
};
