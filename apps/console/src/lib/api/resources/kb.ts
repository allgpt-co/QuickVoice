import { apiClient } from "@/src/lib/api/client";
import type {
  ApiEnvelope,
  KbSourceType,
  KnowledgeSource,
} from "@/src/lib/api/types";

export interface KbDocumentInput {
  name: string;
  sourceType: KbSourceType;
  url?: string;
  s3Key?: string;
  originalFileName?: string;
}

export interface CreateKbInput {
  organizationId: string;
  userId: string;
  agentId?: string | null;
  documents: KbDocumentInput[];
}

export interface UpdateKbInput {
  name?: string;
  agentId?: string;
  url?: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  sourceType: Exclude<KbSourceType, "URL">;
  contentType: string;
  maxUploadBytes: number;
}

export const kbApi = {
  list: async (agentId?: string): Promise<KnowledgeSource[]> => {
    const res = await apiClient.get<ApiEnvelope<KnowledgeSource[]>>("/kb", {
      params: agentId ? { agentId } : undefined,
    });
    return res.data.data;
  },
  create: async (input: CreateKbInput): Promise<KnowledgeSource[]> => {
    const res = await apiClient.post<ApiEnvelope<KnowledgeSource[]>>(
      "/kb",
      input,
    );
    return res.data.data;
  },
  update: async (
    kbId: string,
    input: UpdateKbInput,
  ): Promise<KnowledgeSource> => {
    const res = await apiClient.patch<ApiEnvelope<KnowledgeSource>>(
      `/kb/${kbId}`,
      input,
    );
    return res.data.data;
  },
  remove: async (kbId: string): Promise<void> => {
    await apiClient.delete(`/kb/${kbId}`);
  },
  retry: async (kbId: string): Promise<KnowledgeSource> => {
    const res = await apiClient.post<ApiEnvelope<KnowledgeSource>>(
      `/kb/${kbId}/retry`,
    );
    return res.data.data;
  },
  getUploadUrl: async (
    fileName: string,
    contentType: string,
    fileSize: number,
  ): Promise<UploadUrlResponse> => {
    const res = await apiClient.get<ApiEnvelope<UploadUrlResponse>>(
      "/kb/upload-url",
      {
        params: { fileName, contentType, fileSize },
      },
    );
    return res.data.data;
  },
};
