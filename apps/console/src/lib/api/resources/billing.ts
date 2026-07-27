import { apiClient, unwrap } from "@/src/lib/api/client";

export interface BillingUsage {
  plan: string;
  subscriptionStatus: string | null;
  periodStart: string;
  periodEnd: string;
  includedMinutes: number | null;
  usedMinutes: number;
  usedSeconds: number;
  remainingMinutes: number | null;
  overageMinutes: number;
  percentUsed: number | null;
  callCount: number;
}

export const billingApi = {
  usage: () =>
    unwrap<BillingUsage>(apiClient.get("/billing/usage")),
};
