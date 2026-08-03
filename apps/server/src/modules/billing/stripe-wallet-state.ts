import { createHash, randomUUID } from "node:crypto";

import { MICROS_PER_CENT } from "./money.js";

const RESERVED_IDEMPOTENCY_PREFIXES = ["auto:", "system:"];

export type DurableDisputeState = "NONE" | "OPEN" | "WON" | "LOST";
export type FinancialTopUpStatus =
  | "SUCCEEDED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED";

export class WebhookClaimLostError extends Error {
  constructor() {
    super("Stripe wallet event claim is no longer current");
  }
}

export function organizationStripeCustomerResolution(args: {
  createdCustomerId: string;
  durableCustomerId: string | null | undefined;
}) {
  if (args.durableCustomerId === args.createdCustomerId) {
    return {
      customerId: args.createdCustomerId,
      deleteCreatedCustomer: false,
    } as const;
  }
  if (args.durableCustomerId) {
    return {
      customerId: args.durableCustomerId,
      deleteCreatedCustomer: true,
    } as const;
  }
  return {
    customerId: null,
    deleteCreatedCustomer: true,
  } as const;
}

/**
 * User-supplied keys may never enter namespaces used by background billing.
 * A generated key keeps the API convenient when the caller omits the header.
 */
export function manualTopUpIdempotencyKey(value?: string | null) {
  const key = value == null ? `manual:${randomUUID()}` : value.trim();
  if (!key) {
    throw new Error("Idempotency-Key must not be empty");
  }
  if (key.length > 255) {
    throw new Error("Idempotency-Key must not exceed 255 characters");
  }
  if (
    RESERVED_IDEMPOTENCY_PREFIXES.some((prefix) =>
      key.toLowerCase().startsWith(prefix),
    )
  ) {
    throw new Error("This Idempotency-Key prefix is reserved for QuickVoice");
  }
  return key;
}

/**
 * Stripe caps provider idempotency keys at 255 characters. Hash the complete
 * organization-scoped client key so the durable database key remains intact
 * without leaking its length into the provider request key.
 */
export function manualTopUpStripeIdempotencyKey(
  billingAccountId: string,
  clientIdempotencyKey: string,
) {
  const digest = createHash("sha256")
    .update(JSON.stringify([billingAccountId, clientIdempotencyKey]))
    .digest("hex");
  return `checkout:${digest}`;
}

export function stripeDisputeState(status: string): DurableDisputeState {
  switch (status) {
    case "won":
    case "warning_closed":
    case "prevented":
      return "WON";
    case "lost":
      return "LOST";
    case "needs_response":
    case "under_review":
    case "warning_needs_response":
    case "warning_under_review":
    default:
      // Unknown future statuses retain the hold until they can be classified.
      return "OPEN";
  }
}

/**
 * Completes one claimed webhook attempt. The callbacks must fence writes with
 * the attempt number returned by the atomic claim. A false completion means a
 * newer worker owns the event and must never be overwritten by this worker.
 */
export async function runClaimedWebhookAttempt<T>(args: {
  process: () => Promise<T>;
  complete: (result: T) => Promise<boolean>;
  fail: (error: unknown) => Promise<void>;
}) {
  try {
    const result = await args.process();
    if (!(await args.complete(result))) {
      throw new WebhookClaimLostError();
    }
  } catch (error) {
    await args.fail(error);
    throw error;
  }
}

/** Maps a tax-inclusive provider amount back to wallet principal, rounded down. */
export function principalShareMicros(args: {
  providerAmountCents: number | bigint;
  principalMicros: bigint;
  taxMicros: bigint;
}) {
  const totalMicros = args.principalMicros + args.taxMicros;
  const providerAmountCents = BigInt(args.providerAmountCents);
  if (totalMicros <= 0n || providerAmountCents <= 0n) return 0n;
  const providerAmountMicros = providerAmountCents * MICROS_PER_CENT;
  const proportionalPrincipal =
    (providerAmountMicros * args.principalMicros) / totalMicros;
  return proportionalPrincipal > args.principalMicros
    ? args.principalMicros
    : proportionalPrincipal;
}

/** Older open events cannot reopen a dispute after Stripe has closed it. */
export function mergeDisputeState(
  current: string,
  incoming: DurableDisputeState,
): DurableDisputeState {
  const normalized = isDisputeState(current) ? current : "NONE";
  if (normalized === "WON" || normalized === "LOST") return normalized;
  return incoming;
}

export function financialTopUpStatus(args: {
  creditedMicros: bigint;
  refundedMicros: bigint;
  disputedMicros: bigint;
}): FinancialTopUpStatus {
  if (args.disputedMicros > 0n) return "DISPUTED";
  if (args.creditedMicros > 0n && args.refundedMicros >= args.creditedMicros) {
    return "REFUNDED";
  }
  if (args.refundedMicros > 0n) return "PARTIALLY_REFUNDED";
  return "SUCCEEDED";
}

export function financialPrincipalTargets(args: {
  creditedMicros: bigint;
  taxMicros: bigint;
  refundTargetProviderCents: bigint;
  disputeTargetProviderCents: bigint;
  disputeState: string;
}) {
  const refundedMicros = principalShareMicros({
    providerAmountCents: args.refundTargetProviderCents,
    principalMicros: args.creditedMicros,
    taxMicros: args.taxMicros,
  });
  const remainingMicros = args.creditedMicros - refundedMicros;
  const activeDispute =
    args.disputeState === "OPEN" || args.disputeState === "LOST";
  const disputedTarget = activeDispute
    ? principalShareMicros({
        providerAmountCents: args.disputeTargetProviderCents,
        principalMicros: args.creditedMicros,
        taxMicros: args.taxMicros,
      })
    : 0n;
  return {
    refundedMicros,
    disputedMicros:
      disputedTarget > remainingMicros ? remainingMicros : disputedTarget,
  };
}

export function unappliedFinancialDelta(
  targetMicros: bigint,
  appliedMicros: bigint,
) {
  return targetMicros > appliedMicros ? targetMicros - appliedMicros : 0n;
}

export function autoRechargeFundsDecision(args: {
  paidBalanceMicros: bigint;
  promotionalBalanceMicros: bigint;
  debtMicros: bigint;
  thresholdMicros: bigint;
  requiredPaidMicros?: bigint;
}): "recharge" | "sufficient_paid_credit" | "above_threshold" {
  const availablePaidMicros =
    args.paidBalanceMicros > args.debtMicros
      ? args.paidBalanceMicros - args.debtMicros
      : 0n;
  if (args.requiredPaidMicros !== undefined) {
    return availablePaidMicros >= args.requiredPaidMicros
      ? "sufficient_paid_credit"
      : "recharge";
  }
  const availableUsageMicros =
    args.paidBalanceMicros + args.promotionalBalanceMicros - args.debtMicros;
  return availableUsageMicros > args.thresholdMicros
    ? "above_threshold"
    : "recharge";
}

function isDisputeState(value: string): value is DurableDisputeState {
  return (
    value === "NONE" || value === "OPEN" || value === "WON" || value === "LOST"
  );
}
