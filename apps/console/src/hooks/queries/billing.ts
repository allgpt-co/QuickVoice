"use client";

import { useQuery } from "@tanstack/react-query";

import { billingApi } from "@/src/lib/api/resources/billing";
import { queryKeys } from "@/src/lib/query-keys";

export function useBillingUsage(enabled = true) {
  return useQuery({
    queryKey: queryKeys.billing.usage(),
    queryFn: billingApi.usage,
    enabled,
  });
}
