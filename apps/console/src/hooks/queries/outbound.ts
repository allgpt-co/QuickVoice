"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { outboundApi } from "@/src/lib/api/resources/outbound";
import type {
  CreateBatchCampaignInput,
  OutboundCallListParams,
} from "@/src/lib/api/resources/outbound";
import { downloadBlobAsFile } from "@/src/lib/export-csv";
import type { QuickCallInput } from "@/src/models/outbound/quickCall";
import { queryKeys } from "@/src/lib/query-keys";

export function useOutboundCalls(params: OutboundCallListParams = {}) {
  return useQuery({
    queryKey: [...queryKeys.outbound.all, "calls", params] as const,
    queryFn: () => outboundApi.listOutboundCalls(params),
  });
}

export function useOutboundCall(outboundId?: string | null) {
  return useQuery({
    queryKey: [...queryKeys.outbound.all, "call", outboundId ?? null] as const,
    queryFn: () => outboundApi.getOutboundCall(outboundId as string),
    enabled: Boolean(outboundId),
  });
}

export function useCancelOutboundCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (outboundId: string) =>
      outboundApi.cancelOutboundCall(outboundId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.outbound.all });
      qc.invalidateQueries({ queryKey: queryKeys.calls.all });
      toast.success("Outbound call cancelled");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not cancel outbound call");
    },
  });
}

export function useRetryOutboundCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (outboundId: string) =>
      outboundApi.retryOutboundCall(outboundId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.outbound.all });
      qc.invalidateQueries({ queryKey: queryKeys.calls.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success("Outbound call retry started");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not retry outbound call");
    },
  });
}

export function useQuickOutboundCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickCallInput) => outboundApi.quickCall(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.calls.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.outbound.all });
      toast.success("Outbound call started");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not start outbound call");
    },
  });
}

export function useBatchCampaigns(agentId?: string) {
  return useQuery({
    queryKey: queryKeys.outbound.batches(agentId),
    queryFn: () => outboundApi.listBatchCampaigns(agentId),
  });
}

export function useBatchCampaign(campaignId?: string | null) {
  return useQuery({
    queryKey: [...queryKeys.outbound.all, "batch", campaignId ?? null] as const,
    queryFn: () => outboundApi.getBatchCampaign(campaignId as string),
    enabled: Boolean(campaignId),
  });
}

export function useCreateBatchCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBatchCampaignInput) =>
      outboundApi.createBatchCampaign(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.outbound.all });
      toast.success("Batch campaign queued");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not queue batch campaign");
    },
  });
}

export function useCancelBatchCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) =>
      outboundApi.cancelBatchCampaign(campaignId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.outbound.all });
      toast.success("Campaign cancelled");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not cancel campaign");
    },
  });
}

export function useDownloadBatchCampaignResults() {
  return useMutation({
    mutationFn: (campaignId: string) =>
      outboundApi.downloadBatchCampaignResultsCsv(campaignId),
    onSuccess: ({ blob, filename }) => {
      downloadBlobAsFile(filename, blob);
      toast.success("Campaign results downloaded");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not download campaign results");
    },
  });
}
