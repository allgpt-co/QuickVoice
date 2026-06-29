"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  flowsApi,
  type CreateFlowInput,
  type FlowTestRunInput,
  type UpdateFlowInput,
} from "@/src/lib/api/resources/flows";
import { queryKeys } from "@/src/lib/query-keys";

export function useAgentFlows(rootAgentId: string) {
  return useQuery({
    queryKey: queryKeys.flows.list(rootAgentId),
    queryFn: () => flowsApi.list(rootAgentId),
    enabled: !!rootAgentId,
  });
}

export function useCreateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFlowInput) => flowsApi.create(input),
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: queryKeys.flows.all });
      qc.invalidateQueries({ queryKey: queryKeys.flows.list(flow.rootAgentId) });
      toast.success("Flow created");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create flow");
    },
  });
}

export function useUpdateFlow(flowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFlowInput) => flowsApi.update(flowId, input),
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: queryKeys.flows.all });
      qc.invalidateQueries({ queryKey: queryKeys.flows.detail(flowId) });
      qc.invalidateQueries({ queryKey: queryKeys.flows.list(flow.rootAgentId) });
      toast.success("Flow saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not save flow");
    },
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flowId: string) => flowsApi.remove(flowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.flows.all });
      toast.success("Flow deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not delete flow");
    },
  });
}

export function useRunFlowTest(flowId: string) {
  return useMutation({
    mutationFn: (input: FlowTestRunInput) => flowsApi.testRun(flowId, input),
    onError: (err: Error) => {
      toast.error(err.message || "Could not run flow test");
    },
  });
}
