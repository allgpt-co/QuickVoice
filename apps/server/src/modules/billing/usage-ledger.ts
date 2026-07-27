export type UsageUnit =
  | "second"
  | "minute"
  | "token"
  | "character"
  | "request"
  | "byte"
  | "number"
  | "message"
  | "entitlement";

export type UsageFinality = "estimated" | "final" | "corrected" | "unavailable";

export type UsageLedgerEntry = {
  idempotencyKey: string;
  organizationId: string;
  source: string;
  sourceEventId: string;
  provider?: string;
  providerReference?: string;
  resourceType?: string;
  resourceId?: string;
  sessionId?: string;
  quantity: number;
  unit: UsageUnit;
  originalQuantity?: number;
  originalUnit?: string;
  rateVersion?: string;
  currency?: string;
  amountCents?: number;
  finality: UsageFinality;
  eventTimestamp: Date;
  ingestedAt: Date;
  correctionOf?: string;
  dimensions: Record<string, string>;
};

export type BudgetThresholdDecision = {
  crossed: boolean;
  percentUsed: number;
  thresholdPercent: number;
  severity: "ok" | "warning" | "critical";
};

const SENSITIVE_DIMENSION_PATTERN = /(phone|email|transcript|prompt|message|recording|secret|token|password|payload|authorization)/i;

export function buildUsageLedgerEntry(args: Omit<UsageLedgerEntry, "idempotencyKey" | "ingestedAt" | "dimensions"> & {
  ingestedAt?: Date;
  dimensions?: Record<string, string | number | boolean | null | undefined>;
}) {
  if (!args.source.trim()) throw new Error("usage source is required");
  if (!args.sourceEventId.trim()) throw new Error("usage sourceEventId is required");
  if (args.quantity < 0) throw new Error("usage quantity cannot be negative");
  if (args.amountCents !== undefined && args.amountCents < 0) throw new Error("usage amount cannot be negative");

  return {
    ...args,
    idempotencyKey: `${args.source}:${args.sourceEventId}`,
    ingestedAt: args.ingestedAt ?? new Date(),
    dimensions: normalizeUsageDimensions(args.dimensions ?? {}),
  } satisfies UsageLedgerEntry;
}

export function normalizeUsageDimensions(dimensions: Record<string, string | number | boolean | null | undefined>) {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(dimensions)) {
    if (value === null || value === undefined || value === "") continue;
    if (SENSITIVE_DIMENSION_PATTERN.test(key) || SENSITIVE_DIMENSION_PATTERN.test(String(value))) {
      throw new Error(`usage dimension is not safe for billing ledger: ${key}`);
    }
    normalized[key] = String(value);
  }

  return normalized;
}

export function evaluateBudgetThreshold({
  usedCents,
  budgetCents,
  thresholdPercent,
}: {
  usedCents: number;
  budgetCents: number;
  thresholdPercent: number;
}): BudgetThresholdDecision {
  if (usedCents < 0 || budgetCents <= 0 || thresholdPercent <= 0) {
    throw new Error("budget threshold inputs must be positive");
  }

  const percentUsed = (usedCents / budgetCents) * 100;
  const crossed = percentUsed >= thresholdPercent;
  return {
    crossed,
    percentUsed,
    thresholdPercent,
    severity: !crossed ? "ok" : percentUsed >= 100 ? "critical" : "warning",
  };
}
