"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  agentsApi,
  type ConfigureAgentInput,
  type CreatePreviewSessionInput,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "@/src/lib/api/resources/agents";
import { queryKeys } from "@/src/lib/query-keys";

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => agentsApi.list(),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () =>
      agentsApi.list().then((all) => all.find((a) => a.agentId === id) ?? null),
    enabled: !!id,
    // Avoid refetching (and momentarily unmounting the agent page) when the
    // window regains focus after the browser's microphone permission prompt.
    refetchOnWindowFocus: false,
  });
}

export function useAgentConfig(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.config(id),
    queryFn: () => agentsApi.getConfig(id),
    enabled: !!id,
  });
}

export function useVoiceCatalog() {
  return useQuery({
    queryKey: queryKeys.agents.voiceCatalog(),
    queryFn: () => agentsApi.getVoiceCatalog(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateAgentPreviewSession(agentId: string) {
  return useMutation({
    mutationKey: queryKeys.agents.previewSession(agentId),
    mutationFn: (input?: CreatePreviewSessionInput) =>
      agentsApi.createPreviewSession(agentId, input),
    onError: (err: Error) => {
      toast.error(err.message || "Could not start preview");
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => agentsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.list() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create agent");
    },
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAgentInput) => agentsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.list() });
      qc.invalidateQueries({ queryKey: queryKeys.agents.detail(id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update agent");
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
      toast.success("Agent deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not delete agent");
    },
  });
}

export function useSaveAgentConfig(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfigureAgentInput) => agentsApi.saveConfig(id, input),
    onSuccess: (config, input) => {
      qc.setQueryData(queryKeys.agents.config(id), {
        ...config,
        ivr_navigation_enabled: input.ivr_navigation_enabled,
      });
      qc.invalidateQueries({ queryKey: queryKeys.agents.list() });
      toast.success("Saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not save configuration");
    },
  });
}
