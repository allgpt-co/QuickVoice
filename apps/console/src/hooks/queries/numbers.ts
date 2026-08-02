"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  numbersApi,
  type BuyNumberInput,
  type NumberSearchParams,
  type UpdateNumberInput,
} from "@/src/lib/api/resources/numbers";
import { queryKeys } from "@/src/lib/query-keys";

export function useNumbers() {
  return useQuery({
    queryKey: queryKeys.numbers.list(),
    queryFn: () => numbersApi.list(),
  });
}

export function useNumberSearch(
  params: NumberSearchParams | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.numbers.search(
      params as unknown as Record<string, unknown>,
    ),
    queryFn: () => numbersApi.search(params!),
    enabled: enabled && !!params,
  });
}

export function useBuyNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BuyNumberInput) => numbersApi.buy(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.numbers.list() });
      toast.success("Number purchased");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not purchase number");
    },
  });
}

export function useUpdateNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phId, input }: { phId: string; input: UpdateNumberInput }) =>
      numbersApi.update(phId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.numbers.list() });
      qc.invalidateQueries({ queryKey: queryKeys.agents.list() });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update number");
    },
  });
}

export function useReleaseNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (phId: string) => numbersApi.release(phId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.numbers.list() }),
        qc.invalidateQueries({ queryKey: queryKeys.agents.list() }),
      ]);
      toast.success("Phone number released permanently");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not release number");
    },
  });
}
