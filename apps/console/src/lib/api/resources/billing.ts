import { apiClient, unwrap } from "@/src/lib/api/client";

export type MoneyMicros = number | string;

export interface SavedPaymentMethod {
  id?: string;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
}

export interface AutoRechargeSettings {
  enabled: boolean;
  thresholdMicros?: MoneyMicros;
  amountMicros?: MoneyMicros;
  thresholdCents?: number;
  amountCents?: number;
}

export interface BillingSummary {
  currency?: string;
  status?: string;
  mode?: string;
  billingMode?: string;
  paidBalanceMicros?: MoneyMicros;
  promotionalBalanceMicros?: MoneyMicros;
  paidAvailableMicros?: MoneyMicros;
  promotionalAvailableMicros?: MoneyMicros;
  promoBalanceMicros?: MoneyMicros;
  availableUsageMicros?: MoneyMicros;
  availablePaidOnlyMicros?: MoneyMicros;
  availableBalanceMicros?: MoneyMicros;
  totalBalanceMicros?: MoneyMicros;
  reservedPaidMicros?: MoneyMicros;
  reservedPromotionalMicros?: MoneyMicros;
  reservedTotalMicros?: MoneyMicros;
  outstandingDebtMicros?: MoneyMicros;
  debtMicros?: MoneyMicros;
  canManageBilling?: boolean;
  canManage?: boolean;
  permissions?: {
    canManageBilling?: boolean;
  };
  paymentMethod?: SavedPaymentMethod | null;
  hasPaymentMethod?: boolean;
  hasSavedPaymentMethod?: boolean;
  autoRecharge?: AutoRechargeSettings;
  autoRechargeEnabled?: boolean;
  autoRechargeThresholdMicros?: MoneyMicros;
  autoRechargeAmountMicros?: MoneyMicros;
  legacySubscription?: {
    status?: string;
    endsAt?: string | null;
  } | null;
}

export interface BillingTransaction {
  id?: string;
  transactionId?: string;
  billingTransactionId?: string;
  referenceId?: string | null;
  type?: string;
  kind?: string;
  direction?: "CREDIT" | "DEBIT" | "credit" | "debit";
  amountMicros?: MoneyMicros;
  grossAmountMicros?: MoneyMicros;
  paidBalanceDeltaMicros?: MoneyMicros;
  promotionalBalanceDeltaMicros?: MoneyMicros;
  reservedPaidDeltaMicros?: MoneyMicros;
  reservedPromotionalDeltaMicros?: MoneyMicros;
  debtDeltaMicros?: MoneyMicros;
  paidAmountMicros?: MoneyMicros;
  promotionalAmountMicros?: MoneyMicros;
  description?: string | null;
  status?: string | null;
  createdAt: string;
}

export interface BillingTransactionsPage {
  items: BillingTransaction[];
  nextCursor?: string | null;
}

export interface StripeClientSecretResponse {
  clientSecret?: string;
  url?: string;
}

export interface TopUpCheckoutResponse extends StripeClientSecretResponse {
  topUpId: string;
}

export interface CreateTopUpCheckoutInput {
  amountCents: number;
  idempotencyKey: string;
}

export interface UpdateAutoRechargeInput {
  enabled: boolean;
  thresholdCents: number;
  amountCents: number;
}

export const billingApi = {
  summary: () => unwrap<BillingSummary>(apiClient.get("/billing/summary")),

  transactions: async (): Promise<BillingTransactionsPage> => {
    const response = await apiClient.get<{
      data:
        | BillingTransaction[]
        | {
            items?: BillingTransaction[];
            transactions?: BillingTransaction[];
            nextCursor?: string | null;
          };
      nextCursor?: string | null;
    }>("/billing/transactions");
    const data = response.data.data;

    if (Array.isArray(data)) {
      return { items: data, nextCursor: response.data.nextCursor };
    }
    return {
      items: data.items ?? data.transactions ?? [],
      nextCursor: data.nextCursor,
    };
  },

  createTopUpCheckout: ({
    amountCents,
    idempotencyKey,
  }: CreateTopUpCheckoutInput) =>
    unwrap<TopUpCheckoutResponse>(
      apiClient.post(
        "/billing/top-ups/checkout",
        { amountCents },
        { headers: { "Idempotency-Key": idempotencyKey } },
      ),
    ),

  createPaymentMethodSetup: () =>
    unwrap<StripeClientSecretResponse>(
      apiClient.post("/billing/payment-method/setup"),
    ),

  updateAutoRecharge: (input: UpdateAutoRechargeInput) =>
    unwrap<unknown>(apiClient.patch("/billing/auto-recharge", input)),
};
