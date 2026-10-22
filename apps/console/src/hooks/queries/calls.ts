"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  callsApi,
  type CallListParams,
  type TranscriptParams,
  type LiveCallRoom,
} from "@/src/lib/api/resources/calls";
import { queryKeys } from "@/src/lib/query-keys";

const PAGE_SIZE = 20;

export function useLiveCalls(enabled = true) {
  return useQuery({
    queryKey: queryKeys.calls.live(),
    queryFn: () => callsApi.live(),
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.length ? 10_000 : 60_000,
    retry: false,
  });
}

export function useEndLiveCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomName: string) => callsApi.endLive(roomName),
    onSuccess: async (_data, roomName) => {
      await qc.cancelQueries({ queryKey: queryKeys.calls.live() });
      qc.setQueryData<LiveCallRoom[]>(queryKeys.calls.live(), (current) =>
        current?.filter((call) => call.roomName !== roomName) ?? [],
      );
      void qc.invalidateQueries({ queryKey: queryKeys.calls.live() });
      toast.success("Live call ended");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not end live call");
    },
  });
}

export function useCalls(
  params: Omit<CallListParams, "cursor" | "limit">,
  limit: number = PAGE_SIZE
) {
  return useInfiniteQuery({
    queryKey: queryKeys.calls.list({ ...params, limit }),
    queryFn: ({ pageParam }) =>
      callsApi.list({
        ...params,
        limit,
        cursor: pageParam as string | undefined,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useCall(callId: string) {
  return useQuery({
    queryKey: queryKeys.calls.detail(callId),
    queryFn: () => callsApi.get(callId),
    enabled: !!callId,
  });
}

export function useTranscript(callId: string, params: TranscriptParams = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.calls.transcript(callId),
    queryFn: ({ pageParam }) =>
      callsApi.transcripts(callId, {
        ...params,
        limit: 50,
        cursor: pageParam as string | undefined,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!callId,
  });
}

export function useDeleteCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (callId: string) => callsApi.remove(callId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.calls.all });
      toast.success("Call deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not delete call");
    },
  });
}
