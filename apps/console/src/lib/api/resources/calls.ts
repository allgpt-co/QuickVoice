import { apiClient } from "@/src/lib/api/client";
import type {
  ApiEnvelope,
  CallLog,
  CallStatus,
  CallTranscript,
  CursorPage,
} from "@/src/lib/api/types";

export interface CallListParams {
  agentId?: string;
  status?: CallStatus;
  direction?: "inbound" | "outbound";
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface TranscriptParams {
  limit?: number;
  cursor?: string;
}

export interface LiveCallRoom {
  roomName: string;
  callId: string;
  status: "active";
  direction: "inbound" | "outbound" | "unknown";
  participantCount: number;
  startedAt: string | null;
  agentId?: string | null;
  agentName?: string | null;
  callerId?: string | null;
  calleeId?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
}

export const callsApi = {
  live: async (): Promise<LiveCallRoom[]> => {
    const res = await apiClient.get<ApiEnvelope<LiveCallRoom[]>>("/calls/live");
    return res.data.data;
  },
  endLive: async (roomName: string): Promise<void> => {
    await apiClient.post("/calls/live/end", { roomName });
  },
  list: async (params: CallListParams = {}): Promise<CursorPage<CallLog>> => {
    const res = await apiClient.get<ApiEnvelope<CallLog[]>>("/calls", { params });
    return { data: res.data.data, nextCursor: res.data.nextCursor ?? null };
  },
  get: async (callId: string): Promise<CallLog> => {
    const res = await apiClient.get<ApiEnvelope<CallLog>>(`/calls/${callId}`);
    return res.data.data;
  },
  recordingDownloadUrl: async (callId: string): Promise<string> => {
    const res = await apiClient.get<ApiEnvelope<{ url: string }>>(
      `/calls/${encodeURIComponent(callId)}/recording/download-url`,
    );
    return res.data.data.url;
  },
  transcripts: async (
    callId: string,
    params: TranscriptParams = {}
  ): Promise<CursorPage<CallTranscript>> => {
    const res = await apiClient.get<ApiEnvelope<CallTranscript[]>>(
      `/calls/${callId}/transcripts`,
      { params }
    );
    return { data: res.data.data, nextCursor: res.data.nextCursor ?? null };
  },
  remove: async (callId: string): Promise<void> => {
    await apiClient.delete(`/calls/${callId}`);
  },
};
