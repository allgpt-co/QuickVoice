import { apiClient } from "@/src/lib/api/client";
import type { ApiEnvelope, CallStatus } from "@/src/lib/api/types";
import type { QuickCallInput } from "@/src/models/outbound/quickCall";

export interface OutboundCall {
  outboundId: string;
  organizationId: string;
  agentId: string | null;
  userId: string | null;
  campaignId: string | null;
  scheduledAt: string | null;
  callLogId: string | null;
  phoneNumber: string;
  fromNumber: string;
  firstMessage: string | null;
  systemPrompt: string | null;
  optionalData: Record<string, unknown> | null;
  mode: "quick" | "campaign";
  status: CallStatus;
  failureReason?: string | null;
  cancellationReason?: string | null;
  callLog?: {
    callId: string;
    status: CallStatus;
    startTime: string | null;
    endTime: string | null;
    durationSeconds: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundCallListParams {
  agentId?: string;
  status?: CallStatus;
  mode?: "quick" | "campaign";
  limit?: number;
  cursor?: string;
}

export interface OutboundCallPage {
  items: OutboundCall[];
  count: number;
  filters: Record<string, unknown>;
  nextCursor: string | null;
}

export interface QuickOutboundCallResponse {
  outbound: OutboundCall;
  livekitParticipant: unknown;
  agentDispatch: unknown;
}

export interface BatchUploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  contentType: string;
  maxUploadBytes: number;
}

export interface CreateBatchCampaignInput {
  name: string;
  agentId: string;
  fromNumber: string;
  sourceFileKey: string;
  sourceFileName: string;
  scheduledAt?: string | null;
  timezone: string;
  ringingTimeoutSeconds: number;
}

export interface BatchCampaign {
  campaignId: string;
  name: string;
  agentId: string | null;
  fromNumber: string;
  scheduledAt: string | null;
  sourceFileKey?: string | null;
  sourceFileName: string | null;
  totalRecipients: number;
  validRecipients: number;
  invalidRecipients: number;
  ringingTimeoutSeconds: number;
  timezone: string;
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "PROCESSED" | "FAILED";
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  outboundCalls?: OutboundCall[];
}

export const outboundApi = {
  listOutboundCalls: async (
    params: OutboundCallListParams = {}
  ): Promise<OutboundCallPage> => {
    const res = await apiClient.get<ApiEnvelope<OutboundCallPage>>(
      "/outbound-calls",
      { params }
    );
    return res.data.data;
  },
  getOutboundCall: async (outboundId: string): Promise<OutboundCall> => {
    const res = await apiClient.get<ApiEnvelope<OutboundCall>>(
      `/outbound-calls/${outboundId}`
    );
    return res.data.data;
  },
  cancelOutboundCall: async (outboundId: string): Promise<OutboundCall> => {
    const res = await apiClient.post<ApiEnvelope<OutboundCall>>(
      `/outbound-calls/${outboundId}/cancel`,
      {}
    );
    return res.data.data;
  },
  retryOutboundCall: async (outboundId: string): Promise<unknown> => {
    const res = await apiClient.post<ApiEnvelope<unknown>>(
      `/outbound-calls/${outboundId}/retry`,
      {}
    );
    return res.data.data;
  },
  quickCall: async (
    input: QuickCallInput
  ): Promise<QuickOutboundCallResponse> => {
    const res = await apiClient.post<ApiEnvelope<QuickOutboundCallResponse>>(
      "/outbound-calls/quick",
      input
    );
    return res.data.data;
  },
  getBatchUploadUrl: async (
    fileName: string,
    contentType: string,
    fileSize: number
  ): Promise<BatchUploadUrlResponse> => {
    const res = await apiClient.get<ApiEnvelope<BatchUploadUrlResponse>>(
      "/outbound-calls/batch-upload-url",
      { params: { fileName, contentType, fileSize } }
    );
    return res.data.data;
  },
  createBatchCampaign: async (
    input: CreateBatchCampaignInput
  ): Promise<BatchCampaign> => {
    const res = await apiClient.post<ApiEnvelope<BatchCampaign>>(
      "/outbound-calls/batches",
      input
    );
    return res.data.data;
  },
  listBatchCampaigns: async (agentId?: string): Promise<BatchCampaign[]> => {
    const res = await apiClient.get<ApiEnvelope<BatchCampaign[]>>(
      "/outbound-calls/batches",
      { params: agentId ? { agentId } : undefined }
    );
    return res.data.data;
  },
  getBatchCampaign: async (campaignId: string): Promise<BatchCampaign> => {
    const res = await apiClient.get<ApiEnvelope<BatchCampaign>>(
      `/outbound-calls/batches/${campaignId}`
    );
    return res.data.data;
  },
  cancelBatchCampaign: async (campaignId: string): Promise<BatchCampaign> => {
    const res = await apiClient.post<ApiEnvelope<BatchCampaign>>(
      `/outbound-calls/batches/${campaignId}/cancel`,
      {}
    );
    return res.data.data;
  },
};
