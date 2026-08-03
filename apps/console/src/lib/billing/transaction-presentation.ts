import type { BillingTransaction, MoneyMicros } from "@/src/lib/api/resources/billing";

export type TransactionTone =
  | "credit"
  | "debit"
  | "danger"
  | "hold"
  | "release"
  | "neutral";

export interface TransactionPresentation {
  label: string;
  detail: string;
  statusLabel: string;
  amountMicros: number;
  amountPrefix: string;
  tone: TransactionTone;
}

function asMicros(value: MoneyMicros | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function typeOf(transaction: BillingTransaction) {
  return String(transaction.type ?? transaction.kind ?? "").toUpperCase();
}

function withDescription(transaction: BillingTransaction, fallback: string) {
  return transaction.description?.trim() || fallback;
}

export function getTransactionPresentation(
  transaction: BillingTransaction,
): TransactionPresentation {
  const type = typeOf(transaction);
  const reservedDelta =
    asMicros(transaction.reservedPaidDeltaMicros) +
    asMicros(transaction.reservedPromotionalDeltaMicros);
  const financialDelta =
    asMicros(transaction.paidBalanceDeltaMicros) +
    asMicros(transaction.promotionalBalanceDeltaMicros) -
    asMicros(transaction.debtDeltaMicros);
  const grossAmount = asMicros(
    transaction.grossAmountMicros ?? transaction.amountMicros,
  );
  const magnitude = grossAmount || Math.abs(financialDelta) || Math.abs(reservedDelta);
  const isNumberPurchase = type === "NUMBER_PURCHASE";
  const isNumberRenewal = type === "NUMBER_RENEWAL";

  if (
    type === "CALL_RESERVATION" ||
    ((isNumberPurchase || isNumberRenewal) && reservedDelta > 0)
  ) {
    return {
      label:
        type === "CALL_RESERVATION"
          ? "Call credit hold"
          : isNumberPurchase
            ? "Phone number purchase hold"
            : "Phone number renewal hold",
      detail: `${withDescription(transaction, "Credit reserved before processing")} · Temporary authorization, not a final charge`,
      statusLabel: "Temporary hold",
      amountMicros: magnitude,
      amountPrefix: "Held ",
      tone: "hold",
    };
  }

  if (type === "RESERVATION_RELEASE") {
    const description = withDescription(transaction, "Unused credit hold released");
    const context = description.toLowerCase().includes("number")
      ? "Phone number hold released"
      : description.toLowerCase().includes("call")
        ? "Call credit hold released"
        : "Credit hold released";
    return {
      label: context,
      detail: `${description} · Previously held funds are available again; this is not new credit`,
      statusLabel: "Released",
      amountMicros: magnitude,
      amountPrefix: "Released ",
      tone: "release",
    };
  }

  if (type === "CALL_SETTLEMENT" || isNumberPurchase || isNumberRenewal) {
    return {
      label:
        type === "CALL_SETTLEMENT"
          ? "Call usage settled"
          : isNumberPurchase
            ? "Phone number purchased"
            : "Phone number renewed",
      detail: `${withDescription(transaction, "Measured usage settled")} · Final settled charge`,
      statusLabel: "Settled",
      amountMicros: magnitude,
      amountPrefix: "−",
      tone: "debit",
    };
  }

  if (type === "PROMOTIONAL_GRANT") {
    return {
      label: "Promotional call credit",
      detail: withDescription(transaction, "One-time promotional wallet credit"),
      statusLabel: "Credited",
      amountMicros: magnitude,
      amountPrefix: "+",
      tone: "credit",
    };
  }

  if (type === "TOP_UP") {
    const repaidDebt = asMicros(transaction.debtDeltaMicros) < 0;
    return {
      label: "Wallet top-up",
      detail: repaidDebt
        ? "Outstanding debt was repaid before the remaining credit became available"
        : withDescription(transaction, "Paid credit added to the wallet"),
      statusLabel: repaidDebt ? "Credited · debt repaid" : "Credited",
      amountMicros: magnitude,
      amountPrefix: "+",
      tone: "credit",
    };
  }

  if (type === "REFUND" || type === "DISPUTE") {
    return {
      label: type === "REFUND" ? "Top-up refunded" : "Payment disputed",
      detail:
        type === "REFUND"
          ? "The refunded amount was removed from paid wallet credit"
          : "The disputed payment was reversed from paid wallet credit",
      statusLabel: "Reversed",
      amountMicros: magnitude,
      amountPrefix: "−",
      tone: "danger",
    };
  }

  if (type === "DEBT_INCURRED") {
    return {
      label: "Outstanding usage debt",
      detail: withDescription(
        transaction,
        "Provider reconciliation exceeded the available call reserve",
      ),
      statusLabel: "Amount due",
      amountMicros: magnitude,
      amountPrefix: "Owed ",
      tone: "danger",
    };
  }

  if (type === "DEBT_REPAYMENT") {
    return {
      label: "Outstanding debt repaid",
      detail: withDescription(transaction, "Wallet funds applied to outstanding debt"),
      statusLabel: "Applied to debt",
      amountMicros: magnitude,
      amountPrefix: "Applied ",
      tone: "release",
    };
  }

  if (type === "ADJUSTMENT") {
    const isCredit = financialDelta >= 0;
    return {
      label: withDescription(transaction, "Wallet adjustment"),
      detail: isCredit
        ? "Usage correction returned credit to the wallet"
        : "Billing adjustment removed wallet credit",
      statusLabel: "Adjusted",
      amountMicros: magnitude,
      amountPrefix: isCredit ? "+" : "−",
      tone: isCredit ? "credit" : "debit",
    };
  }

  const isCredit = financialDelta >= 0;
  return {
    label: withDescription(transaction, type ? type.replaceAll("_", " ") : "Wallet adjustment"),
    detail: type ? type.replaceAll("_", " ").toLowerCase() : "Wallet activity",
    statusLabel: transaction.status?.trim() || "Recorded",
    amountMicros: magnitude,
    amountPrefix: isCredit ? "+" : "−",
    tone: financialDelta === 0 ? "neutral" : isCredit ? "credit" : "debit",
  };
}
