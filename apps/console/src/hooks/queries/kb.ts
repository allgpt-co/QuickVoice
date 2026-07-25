"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { kbApi, type CreateKbInput } from "@/src/lib/api/resources/kb";
import { queryKeys } from "@/src/lib/query-keys";

export function useKbSources(agentId?: string) {
  return useQuery({
    queryKey: queryKeys.kb.list(agentId),
    queryFn: () => kbApi.list(agentId),
    refetchInterval: (query) =>
      query.state.data?.some((source) => source.status === "PROCESSING")
        ? 2_000
        : false,
  });
}

export function useCreateKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateKbInput) => kbApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kb.all });
      toast.success("Document added");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not add document");
    },
  });
}

export function useDeleteKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kbId: string) => kbApi.remove(kbId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kb.all });
      toast.success("Document deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not delete document");
    },
  });
}
