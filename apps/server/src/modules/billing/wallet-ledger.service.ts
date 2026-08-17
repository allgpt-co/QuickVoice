import type {
  BillingAccount,
  BillingReservation,
  BillingTransaction,
  Prisma,
} from "../../../prisma/generated/prisma/client.js";
import {
  BillingReservationPurpose,
  BillingTransactionType,
} from "../../../prisma/generated/prisma/enums.js";
import prisma from "../../config/prisma.js";
import {
  SIGNUP_PROMOTIONAL_CREDIT_MICROS,
  assertNonNegativeMicros,
  assertPositiveMicros,
} from "./money.js";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type Database = typeof prisma;
type TransactionClient = Prisma.TransactionClient;
type TransactionType =
  (typeof BillingTransactionType)[keyof typeof BillingTransactionType];
type ReservationPurpose =
  (typeof BillingReservationPurpose)[keyof typeof BillingReservationPurpose];

export type BillingMetadata = Prisma.InputJsonValue;

export type BillingSummary = {
  billingAccountId: string;
  organizationId: string;
  currency: string;
  paidBalanceMicros: bigint;
  promotionalBalanceMicros: bigint;
  availableUsageMicros: bigint;
  availablePaidOnlyMicros: bigint;
  reservedPaidMicros: bigint;
  reservedPromotionalMicros: bigint;
  reservedTotalMicros: bigint;
  debtMicros: bigint;
  autoRechargeEnabled: boolean;
  autoRechargeThresholdMicros: bigint;
  autoRechargeAmountMicros: bigint;
  hasSavedPaymentMethod: boolean;
};

export type LedgerMutationResult = {
  account: BillingSummary;
  transaction: BillingTransaction;
};

export type ReservationMutationResult = LedgerMutationResult & {
  reservation: BillingReservation;
};

type LedgerDeltas = {
  paidBalanceDeltaMicros?: bigint;
  promotionalBalanceDeltaMicros?: bigint;
  reservedPaidDeltaMicros?: bigint;
  reservedPromotionalDeltaMicros?: bigint;
  debtDeltaMicros?: bigint;
};

type LedgerContext = {
  type: TransactionType;
  idempotencyKey: string;
  grossAmountMicros: bigint;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: BillingMetadata;
};

export class InsufficientCreditError extends Error {
  readonly code = "INSUFFICIENT_CREDIT";

  constructor(
    readonly requiredMicros: bigint,
    readonly availableMicros: bigint,
    readonly purpose: ReservationPurpose,
  ) {
    super(
      `Insufficient credit: requires ${requiredMicros} micro-USD, ${availableMicros} available`,
    );
    this.name = "InsufficientCreditError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor(readonly idempotencyKey: string) {
    super(
      `Idempotency key was already used with different parameters: ${idempotencyKey}`,
    );
    this.name = "IdempotencyConflictError";
  }
}

export class ReservationStateError extends Error {
  readonly code = "RESERVATION_STATE_CONFLICT";

  constructor(
    readonly reservationId: string,
    readonly status: string,
  ) {
    super(`Reservation ${reservationId} is ${status.toLowerCase()}`);
    this.name = "ReservationStateError";
  }
}

export class WalletLedgerService {
  constructor(private readonly database: Database = prisma) {}

  async ensureBillingAccount(organizationId: string): Promise<BillingSummary> {
    const account = await this.database.billingAccount.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
    return toBillingSummary(account);
  }

  async getBillingSummary(organizationId: string): Promise<BillingSummary> {
    const account = await this.database.billingAccount.findUnique({
      where: { organizationId },
    });
    if (account) return toBillingSummary(account);
    return this.ensureBillingAccount(organizationId);
  }

  async grantSignupPromotionalCredit(args: {
    organizationId: string;
    userId: string;
    identityHash: string;
    amountMicros?: bigint;
    reason?: string;
    metadata?: BillingMetadata;
  }) {
    const amountMicros = args.amountMicros ?? SIGNUP_PROMOTIONAL_CREDIT_MICROS;
    assertPositiveMicros(amountMicros);

    return this.serializable(async (tx) => {
      const existingGrant = await tx.promotionalGrant.findFirst({
        where: {
          OR: [
            { userId: args.userId },
            { organizationId: args.organizationId },
            { identityHash: args.identityHash },
          ],
        },
      });
      if (existingGrant) {
        if (
          !existingGrant.billingAccountId ||
          !existingGrant.billingTransactionId
        ) {
          // The original workspace was deleted, but the durable email claim
          // intentionally survives. Deny a second grant without dereferencing
          // the now-null historical foreign keys.
          const account = await ensureAccount(tx, args.organizationId);
          return {
            granted: false,
            grant: existingGrant,
            account: toBillingSummary(account),
            transaction: null,
          };
        }
        const [account, transaction] = await Promise.all([
          tx.billingAccount.findUniqueOrThrow({
            where: { billingAccountId: existingGrant.billingAccountId },
          }),
          tx.billingTransaction.findUniqueOrThrow({
            where: { billingTransactionId: existingGrant.billingTransactionId },
          }),
        ]);
        return {
          granted: false,
          grant: existingGrant,
          account: toBillingSummary(account),
          transaction,
        };
      }

      const account = await ensureAccount(tx, args.organizationId);
      const idempotencyKey = operationKey("promotion", args.userId);
      const next = projectAccount(account, {
        promotionalBalanceDeltaMicros: amountMicros,
      });
      const updatedAccount = await updateAccount(tx, account, next);
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type: BillingTransactionType.PROMOTIONAL_GRANT,
          idempotencyKey,
          grossAmountMicros: amountMicros,
          referenceType: "user",
          referenceId: args.userId,
          description: args.reason ?? "Signup promotional credit",
          metadata: args.metadata,
        },
        { promotionalBalanceDeltaMicros: amountMicros },
      );
      const grant = await tx.promotionalGrant.create({
        data: {
          userId: args.userId,
          identityHash: args.identityHash,
          organizationId: args.organizationId,
          billingAccountId: account.billingAccountId,
          amountMicros,
          billingTransactionId: transaction.billingTransactionId,
          reason: args.reason ?? "signup",
        },
      });

      return {
        granted: true,
        grant,
        account: toBillingSummary(updatedAccount),
        transaction,
      };
    });
  }

  async creditPaidBalance(args: {
    organizationId: string;
    amountMicros: bigint;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    description?: string;
    metadata?: BillingMetadata;
    type?:
      | typeof BillingTransactionType.TOP_UP
      | typeof BillingTransactionType.ADJUSTMENT;
  }): Promise<LedgerMutationResult> {
    assertPositiveMicros(args.amountMicros);

    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const ledgerKey = operationKey("credit", args.idempotencyKey);
      const type = args.type ?? BillingTransactionType.TOP_UP;
      const existing = await findIdempotentTransaction(tx, account, {
        type,
        idempotencyKey: ledgerKey,
        grossAmountMicros: args.amountMicros,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      });
      if (existing) return existing;

      const debtRepaidMicros = minBigInt(account.debtMicros, args.amountMicros);
      const paidCreditMicros = args.amountMicros - debtRepaidMicros;
      const deltas: LedgerDeltas = {
        paidBalanceDeltaMicros: paidCreditMicros,
        debtDeltaMicros: -debtRepaidMicros,
      };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type,
          idempotencyKey: ledgerKey,
          grossAmountMicros: args.amountMicros,
          referenceType: args.referenceType,
          referenceId: args.referenceId,
          description: args.description,
          metadata: args.metadata,
        },
        deltas,
      );
      return { account: toBillingSummary(updatedAccount), transaction };
    });
  }

  async debitPaidBalance(args: {
    organizationId: string;
    amountMicros: bigint;
    idempotencyKey: string;
    type:
      | typeof BillingTransactionType.REFUND
      | typeof BillingTransactionType.DISPUTE;
    referenceType?: string;
    referenceId?: string;
    description?: string;
    metadata?: BillingMetadata;
  }): Promise<LedgerMutationResult> {
    assertPositiveMicros(args.amountMicros);
    if (
      args.type !== BillingTransactionType.REFUND &&
      args.type !== BillingTransactionType.DISPUTE
    ) {
      throw new TypeError(
        "Paid balance reversal type must be REFUND or DISPUTE",
      );
    }

    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const ledgerKey = operationKey("paid-reversal", args.idempotencyKey);
      const existing = await findIdempotentTransaction(tx, account, {
        type: args.type,
        idempotencyKey: ledgerKey,
        grossAmountMicros: args.amountMicros,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      });
      if (existing) return existing;

      const paidDebitMicros = minBigInt(
        account.paidBalanceMicros,
        args.amountMicros,
      );
      const debtMicros = args.amountMicros - paidDebitMicros;
      const deltas: LedgerDeltas = {
        paidBalanceDeltaMicros: -paidDebitMicros,
        debtDeltaMicros: debtMicros,
      };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type: args.type,
          idempotencyKey: ledgerKey,
          grossAmountMicros: args.amountMicros,
          referenceType: args.referenceType,
          referenceId: args.referenceId,
          description: args.description,
          metadata: args.metadata,
        },
        deltas,
      );
      return { account: toBillingSummary(updatedAccount), transaction };
    });
  }

  reversePaidCredit(
    args: Parameters<WalletLedgerService["debitPaidBalance"]>[0],
  ) {
    return this.debitPaidBalance(args);
  }

  async creditUsageAdjustment(args: {
    organizationId: string;
    paidAmountMicros: bigint;
    promotionalAmountMicros: bigint;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    description?: string;
    metadata?: BillingMetadata;
  }): Promise<LedgerMutationResult> {
    assertNonNegativeMicros(args.paidAmountMicros, "paidAmountMicros");
    assertNonNegativeMicros(
      args.promotionalAmountMicros,
      "promotionalAmountMicros",
    );
    const totalAmountMicros =
      args.paidAmountMicros + args.promotionalAmountMicros;
    assertPositiveMicros(totalAmountMicros);

    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const ledgerKey = operationKey("usage-adjustment", args.idempotencyKey);
      const existing = await findIdempotentTransaction(tx, account, {
        type: BillingTransactionType.ADJUSTMENT,
        idempotencyKey: ledgerKey,
        grossAmountMicros: totalAmountMicros,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      });
      if (existing) return existing;

      // Over-estimation can have created debt. Clear that debt before making
      // funds spendable, consuming the paid-origin correction first and then
      // the promotional-origin correction. Any remainder returns to its exact
      // source bucket, so promo can never become number-eligible paid credit.
      const paidAppliedToDebt = minBigInt(
        args.paidAmountMicros,
        account.debtMicros,
      );
      const debtAfterPaid = account.debtMicros - paidAppliedToDebt;
      const promotionalAppliedToDebt = minBigInt(
        args.promotionalAmountMicros,
        debtAfterPaid,
      );
      const debtRepaidMicros = paidAppliedToDebt + promotionalAppliedToDebt;
      const deltas: LedgerDeltas = {
        paidBalanceDeltaMicros: args.paidAmountMicros - paidAppliedToDebt,
        promotionalBalanceDeltaMicros:
          args.promotionalAmountMicros - promotionalAppliedToDebt,
        debtDeltaMicros: -debtRepaidMicros,
      };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type: BillingTransactionType.ADJUSTMENT,
          idempotencyKey: ledgerKey,
          grossAmountMicros: totalAmountMicros,
          referenceType: args.referenceType,
          referenceId: args.referenceId,
          description: args.description ?? "Call usage reconciliation credit",
          metadata: args.metadata,
        },
        deltas,
      );
      return { account: toBillingSummary(updatedAccount), transaction };
    });
  }

  async debitUsageAdjustment(args: {
    organizationId: string;
    amountMicros: bigint;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    description?: string;
    metadata?: BillingMetadata;
  }): Promise<LedgerMutationResult> {
    assertPositiveMicros(args.amountMicros);

    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const ledgerKey = operationKey(
        "usage-adjustment-debit",
        args.idempotencyKey,
      );
      const existing = await findIdempotentTransaction(tx, account, {
        type: BillingTransactionType.CALL_SETTLEMENT,
        idempotencyKey: ledgerKey,
        grossAmountMicros: args.amountMicros,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      });
      if (existing) return existing;

      const promotionalDebit = minBigInt(
        account.promotionalBalanceMicros,
        args.amountMicros,
      );
      const afterPromotion = args.amountMicros - promotionalDebit;
      const paidDebit = minBigInt(account.paidBalanceMicros, afterPromotion);
      const debtIncurredMicros = afterPromotion - paidDebit;
      const deltas: LedgerDeltas = {
        promotionalBalanceDeltaMicros: -promotionalDebit,
        paidBalanceDeltaMicros: -paidDebit,
        debtDeltaMicros: debtIncurredMicros,
      };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type: BillingTransactionType.CALL_SETTLEMENT,
          idempotencyKey: ledgerKey,
          grossAmountMicros: args.amountMicros,
          referenceType: args.referenceType,
          referenceId: args.referenceId,
          description: args.description ?? "Call usage reconciliation debit",
          metadata: args.metadata,
        },
        deltas,
      );
      return { account: toBillingSummary(updatedAccount), transaction };
    });
  }

  reserveUsageCredit(
    args: ReserveCreditArgs,
  ): Promise<ReservationMutationResult> {
    return this.reserveCredit({
      ...args,
      purpose: BillingReservationPurpose.CALL_USAGE,
      promotionalCreditAllowed: true,
    });
  }

  reservePaidNumberCredit(
    args: ReserveCreditArgs & {
      purpose:
        | typeof BillingReservationPurpose.PHONE_NUMBER_PURCHASE
        | typeof BillingReservationPurpose.PHONE_NUMBER_RENEWAL;
    },
  ): Promise<ReservationMutationResult> {
    return this.reserveCredit({
      ...args,
      promotionalCreditAllowed: false,
    });
  }

  async settleReservation(args: {
    organizationId: string;
    reservationId: string;
    actualAmountMicros: bigint;
    idempotencyKey: string;
    description?: string;
    metadata?: BillingMetadata;
  }): Promise<ReservationMutationResult> {
    assertNonNegativeMicros(args.actualAmountMicros, "actualAmountMicros");

    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const ledgerKey = operationKey("settle", args.idempotencyKey);
      const reservation = await tx.billingReservation.findFirstOrThrow({
        where: {
          billingReservationId: args.reservationId,
          organizationId: args.organizationId,
        },
      });
      const type = settlementType(reservation.purpose);
      const existing = await findIdempotentTransaction(tx, account, {
        type,
        idempotencyKey: ledgerKey,
        grossAmountMicros: args.actualAmountMicros,
        referenceType: "billing_reservation",
        referenceId: reservation.billingReservationId,
      });
      if (existing) {
        const latestReservation = await tx.billingReservation.findUniqueOrThrow(
          {
            where: { billingReservationId: reservation.billingReservationId },
          },
        );
        return { ...existing, reservation: latestReservation };
      }
      if (reservation.status !== "ACTIVE") {
        throw new ReservationStateError(
          reservation.billingReservationId,
          reservation.status,
        );
      }

      const promotionalSpentFromReserve = minBigInt(
        reservation.promotionalAmountMicros,
        args.actualAmountMicros,
      );
      const paidSpentFromReserve = minBigInt(
        reservation.paidAmountMicros,
        args.actualAmountMicros - promotionalSpentFromReserve,
      );
      const reservedSpent = promotionalSpentFromReserve + paidSpentFromReserve;
      const promotionalRelease =
        reservation.promotionalAmountMicros - promotionalSpentFromReserve;
      const paidRelease = reservation.paidAmountMicros - paidSpentFromReserve;

      let uncollected = args.actualAmountMicros - reservedSpent;
      const promotionalDebit =
        reservation.purpose === BillingReservationPurpose.CALL_USAGE
          ? minBigInt(account.promotionalBalanceMicros, uncollected)
          : 0n;
      uncollected -= promotionalDebit;
      const paidDebit = minBigInt(account.paidBalanceMicros, uncollected);
      uncollected -= paidDebit;
      const debtIncurredMicros = uncollected;

      const deltas: LedgerDeltas = {
        paidBalanceDeltaMicros: paidRelease - paidDebit,
        promotionalBalanceDeltaMicros: promotionalRelease - promotionalDebit,
        reservedPaidDeltaMicros: -reservation.paidAmountMicros,
        reservedPromotionalDeltaMicros: -reservation.promotionalAmountMicros,
        debtDeltaMicros: debtIncurredMicros,
      };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type,
          idempotencyKey: ledgerKey,
          grossAmountMicros: args.actualAmountMicros,
          referenceType: "billing_reservation",
          referenceId: reservation.billingReservationId,
          description: args.description,
          metadata: args.metadata,
        },
        deltas,
      );
      const updatedReservation = await tx.billingReservation.update({
        where: { billingReservationId: reservation.billingReservationId },
        data: {
          status: "SETTLED",
          settledAmountMicros: args.actualAmountMicros,
          debtIncurredMicros,
          settledAt: new Date(),
        },
      });
      return {
        account: toBillingSummary(updatedAccount),
        transaction,
        reservation: updatedReservation,
      };
    });
  }

  async releaseReservation(args: {
    organizationId: string;
    reservationId: string;
    idempotencyKey: string;
    description?: string;
    metadata?: BillingMetadata;
  }): Promise<ReservationMutationResult> {
    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const ledgerKey = operationKey("release", args.idempotencyKey);
      const reservation = await tx.billingReservation.findFirstOrThrow({
        where: {
          billingReservationId: args.reservationId,
          organizationId: args.organizationId,
        },
      });
      const existing = await findIdempotentTransaction(tx, account, {
        type: BillingTransactionType.RESERVATION_RELEASE,
        idempotencyKey: ledgerKey,
        grossAmountMicros: reservation.amountMicros,
        referenceType: "billing_reservation",
        referenceId: reservation.billingReservationId,
      });
      if (existing) {
        const latestReservation = await tx.billingReservation.findUniqueOrThrow(
          {
            where: { billingReservationId: reservation.billingReservationId },
          },
        );
        return { ...existing, reservation: latestReservation };
      }
      if (reservation.status !== "ACTIVE") {
        throw new ReservationStateError(
          reservation.billingReservationId,
          reservation.status,
        );
      }

      const deltas: LedgerDeltas = {
        paidBalanceDeltaMicros: reservation.paidAmountMicros,
        promotionalBalanceDeltaMicros: reservation.promotionalAmountMicros,
        reservedPaidDeltaMicros: -reservation.paidAmountMicros,
        reservedPromotionalDeltaMicros: -reservation.promotionalAmountMicros,
      };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type: BillingTransactionType.RESERVATION_RELEASE,
          idempotencyKey: ledgerKey,
          grossAmountMicros: reservation.amountMicros,
          referenceType: "billing_reservation",
          referenceId: reservation.billingReservationId,
          description: args.description,
          metadata: args.metadata,
        },
        deltas,
      );
      const updatedReservation = await tx.billingReservation.update({
        where: { billingReservationId: reservation.billingReservationId },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      return {
        account: toBillingSummary(updatedAccount),
        transaction,
        reservation: updatedReservation,
      };
    });
  }

  async recordOutstandingDebt(args: {
    organizationId: string;
    amountMicros: bigint;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    description?: string;
    metadata?: BillingMetadata;
  }): Promise<LedgerMutationResult> {
    assertPositiveMicros(args.amountMicros);

    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const ledgerKey = operationKey("debt", args.idempotencyKey);
      const existing = await findIdempotentTransaction(tx, account, {
        type: BillingTransactionType.DEBT_INCURRED,
        idempotencyKey: ledgerKey,
        grossAmountMicros: args.amountMicros,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      });
      if (existing) return existing;

      const deltas = { debtDeltaMicros: args.amountMicros };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type: BillingTransactionType.DEBT_INCURRED,
          idempotencyKey: ledgerKey,
          grossAmountMicros: args.amountMicros,
          referenceType: args.referenceType,
          referenceId: args.referenceId,
          description: args.description,
          metadata: args.metadata,
        },
        deltas,
      );
      return { account: toBillingSummary(updatedAccount), transaction };
    });
  }

  async listBillingTransactions(args: {
    organizationId: string;
    limit?: number;
    cursor?: string;
  }): Promise<BillingTransaction[]> {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    return this.database.billingTransaction.findMany({
      where: { organizationId: args.organizationId },
      orderBy: [{ createdAt: "desc" }, { billingTransactionId: "desc" }],
      take: limit,
      ...(args.cursor
        ? {
            cursor: { billingTransactionId: args.cursor },
            skip: 1,
          }
        : {}),
    });
  }

  private async reserveCredit(
    args: ReserveCreditArgs & {
      purpose: ReservationPurpose;
      promotionalCreditAllowed: boolean;
    },
  ): Promise<ReservationMutationResult> {
    assertPositiveMicros(args.amountMicros);

    return this.serializable(async (tx) => {
      const account = await ensureAccount(tx, args.organizationId);
      const existingReservation = await tx.billingReservation.findUnique({
        where: {
          billingAccountId_idempotencyKey: {
            billingAccountId: account.billingAccountId,
            idempotencyKey: args.idempotencyKey,
          },
        },
      });
      const transactionType = reservationType(args.purpose);
      const ledgerKey = operationKey("reserve", args.idempotencyKey);
      if (existingReservation) {
        if (
          existingReservation.amountMicros !== args.amountMicros ||
          existingReservation.purpose !== args.purpose ||
          existingReservation.referenceType !== (args.referenceType ?? null) ||
          existingReservation.referenceId !== (args.referenceId ?? null)
        ) {
          throw new IdempotencyConflictError(args.idempotencyKey);
        }
        if (existingReservation.status !== "ACTIVE") {
          throw new ReservationStateError(
            existingReservation.billingReservationId,
            existingReservation.status,
          );
        }

        let currentReservation = existingReservation;
        if (
          currentReservation.expiresAt &&
          currentReservation.expiresAt.getTime() <= Date.now()
        ) {
          if (!args.expiresAt || args.expiresAt.getTime() <= Date.now()) {
            throw new ReservationStateError(
              currentReservation.billingReservationId,
              "EXPIRED",
            );
          }
          // A retry may arrive after the original authorization TTL but before
          // the sweeper wins. Renew the still-active hold inside the same
          // serializable transaction. If the sweeper already released it, the
          // conditional update loses and this retry fails closed.
          const renewed = await tx.billingReservation.updateMany({
            where: {
              billingReservationId: currentReservation.billingReservationId,
              status: "ACTIVE",
              expiresAt: { lte: new Date() },
            },
            data: { expiresAt: args.expiresAt },
          });
          if (renewed.count !== 1) {
            currentReservation = await tx.billingReservation.findUniqueOrThrow({
              where: {
                billingReservationId: currentReservation.billingReservationId,
              },
            });
            if (
              currentReservation.status !== "ACTIVE" ||
              (currentReservation.expiresAt &&
                currentReservation.expiresAt.getTime() <= Date.now())
            ) {
              throw new ReservationStateError(
                currentReservation.billingReservationId,
                currentReservation.status === "ACTIVE"
                  ? "EXPIRED"
                  : currentReservation.status,
              );
            }
          } else {
            currentReservation = {
              ...currentReservation,
              expiresAt: args.expiresAt,
            };
          }
        }
        const transaction = await tx.billingTransaction.findUniqueOrThrow({
          where: {
            billingAccountId_idempotencyKey: {
              billingAccountId: account.billingAccountId,
              idempotencyKey: ledgerKey,
            },
          },
        });
        return {
          account: toBillingSummary(account),
          transaction,
          reservation: currentReservation,
        };
      }

      const availableMicros = args.promotionalCreditAllowed
        ? account.promotionalBalanceMicros + account.paidBalanceMicros
        : account.paidBalanceMicros;
      if (account.debtMicros > 0n || availableMicros < args.amountMicros) {
        throw new InsufficientCreditError(
          args.amountMicros,
          account.debtMicros > 0n ? 0n : availableMicros,
          args.purpose,
        );
      }

      const promotionalAmountMicros = args.promotionalCreditAllowed
        ? minBigInt(account.promotionalBalanceMicros, args.amountMicros)
        : 0n;
      const paidAmountMicros = args.amountMicros - promotionalAmountMicros;
      const deltas: LedgerDeltas = {
        paidBalanceDeltaMicros: -paidAmountMicros,
        promotionalBalanceDeltaMicros: -promotionalAmountMicros,
        reservedPaidDeltaMicros: paidAmountMicros,
        reservedPromotionalDeltaMicros: promotionalAmountMicros,
      };
      const updatedAccount = await updateAccount(
        tx,
        account,
        projectAccount(account, deltas),
      );
      const reservation = await tx.billingReservation.create({
        data: {
          billingAccountId: account.billingAccountId,
          organizationId: args.organizationId,
          purpose: args.purpose,
          idempotencyKey: args.idempotencyKey,
          amountMicros: args.amountMicros,
          paidAmountMicros,
          promotionalAmountMicros,
          referenceType: args.referenceType,
          referenceId: args.referenceId,
          expiresAt: args.expiresAt,
        },
      });
      const transaction = await createLedgerTransaction(
        tx,
        updatedAccount,
        {
          type: transactionType,
          idempotencyKey: ledgerKey,
          grossAmountMicros: args.amountMicros,
          referenceType: "billing_reservation",
          referenceId: reservation.billingReservationId,
          description: args.description,
          metadata: args.metadata,
        },
        deltas,
      );
      return {
        account: toBillingSummary(updatedAccount),
        transaction,
        reservation,
      };
    });
  }

  private async serializable<T>(
    work: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.database.$transaction(work, {
          isolationLevel: "Serializable",
        });
      } catch (error) {
        if (
          attempt >= MAX_SERIALIZABLE_ATTEMPTS ||
          !isRetryableTransactionError(error)
        ) {
          throw error;
        }
      }
    }
  }
}

export type ReserveCreditArgs = {
  organizationId: string;
  amountMicros: bigint;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: BillingMetadata;
  expiresAt?: Date;
};

type AccountProjection = Pick<
  BillingAccount,
  | "paidBalanceMicros"
  | "promotionalBalanceMicros"
  | "reservedPaidMicros"
  | "reservedPromotionalMicros"
  | "debtMicros"
>;

async function ensureAccount(
  tx: TransactionClient,
  organizationId: string,
): Promise<BillingAccount> {
  return tx.billingAccount.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

function projectAccount(
  account: BillingAccount,
  deltas: LedgerDeltas,
): AccountProjection {
  const next = {
    paidBalanceMicros:
      account.paidBalanceMicros + (deltas.paidBalanceDeltaMicros ?? 0n),
    promotionalBalanceMicros:
      account.promotionalBalanceMicros +
      (deltas.promotionalBalanceDeltaMicros ?? 0n),
    reservedPaidMicros:
      account.reservedPaidMicros + (deltas.reservedPaidDeltaMicros ?? 0n),
    reservedPromotionalMicros:
      account.reservedPromotionalMicros +
      (deltas.reservedPromotionalDeltaMicros ?? 0n),
    debtMicros: account.debtMicros + (deltas.debtDeltaMicros ?? 0n),
  };
  for (const [field, value] of Object.entries(next)) {
    if (value < 0n)
      throw new RangeError(`Billing projection would make ${field} negative`);
  }
  return next;
}

async function updateAccount(
  tx: TransactionClient,
  account: BillingAccount,
  next: AccountProjection,
): Promise<BillingAccount> {
  return tx.billingAccount.update({
    where: { billingAccountId: account.billingAccountId },
    data: next,
  });
}

async function createLedgerTransaction(
  tx: TransactionClient,
  account: BillingAccount,
  context: LedgerContext,
  deltas: LedgerDeltas,
): Promise<BillingTransaction> {
  return tx.billingTransaction.create({
    data: {
      billingAccountId: account.billingAccountId,
      organizationId: account.organizationId,
      type: context.type,
      idempotencyKey: context.idempotencyKey,
      grossAmountMicros: context.grossAmountMicros,
      paidBalanceDeltaMicros: deltas.paidBalanceDeltaMicros ?? 0n,
      promotionalBalanceDeltaMicros: deltas.promotionalBalanceDeltaMicros ?? 0n,
      reservedPaidDeltaMicros: deltas.reservedPaidDeltaMicros ?? 0n,
      reservedPromotionalDeltaMicros:
        deltas.reservedPromotionalDeltaMicros ?? 0n,
      debtDeltaMicros: deltas.debtDeltaMicros ?? 0n,
      paidBalanceAfterMicros: account.paidBalanceMicros,
      promotionalBalanceAfterMicros: account.promotionalBalanceMicros,
      reservedPaidAfterMicros: account.reservedPaidMicros,
      reservedPromotionalAfterMicros: account.reservedPromotionalMicros,
      debtAfterMicros: account.debtMicros,
      referenceType: context.referenceType,
      referenceId: context.referenceId,
      description: context.description,
      metadata: context.metadata,
    },
  });
}

async function findIdempotentTransaction(
  tx: TransactionClient,
  account: BillingAccount,
  expected: Pick<
    LedgerContext,
    | "type"
    | "idempotencyKey"
    | "grossAmountMicros"
    | "referenceType"
    | "referenceId"
  >,
): Promise<LedgerMutationResult | null> {
  const transaction = await tx.billingTransaction.findUnique({
    where: {
      billingAccountId_idempotencyKey: {
        billingAccountId: account.billingAccountId,
        idempotencyKey: expected.idempotencyKey,
      },
    },
  });
  if (!transaction) return null;
  if (
    transaction.type !== expected.type ||
    transaction.grossAmountMicros !== expected.grossAmountMicros ||
    transaction.referenceType !== (expected.referenceType ?? null) ||
    transaction.referenceId !== (expected.referenceId ?? null)
  ) {
    throw new IdempotencyConflictError(expected.idempotencyKey);
  }
  return { account: toBillingSummary(account), transaction };
}

function reservationType(purpose: ReservationPurpose): TransactionType {
  switch (purpose) {
    case BillingReservationPurpose.CALL_USAGE:
      return BillingTransactionType.CALL_RESERVATION;
    case BillingReservationPurpose.PHONE_NUMBER_PURCHASE:
      return BillingTransactionType.NUMBER_PURCHASE;
    case BillingReservationPurpose.PHONE_NUMBER_RENEWAL:
      return BillingTransactionType.NUMBER_RENEWAL;
  }
}

function settlementType(purpose: ReservationPurpose): TransactionType {
  switch (purpose) {
    case BillingReservationPurpose.CALL_USAGE:
      return BillingTransactionType.CALL_SETTLEMENT;
    case BillingReservationPurpose.PHONE_NUMBER_PURCHASE:
      return BillingTransactionType.NUMBER_PURCHASE;
    case BillingReservationPurpose.PHONE_NUMBER_RENEWAL:
      return BillingTransactionType.NUMBER_RENEWAL;
  }
}

function operationKey(operation: string, idempotencyKey: string): string {
  const key = idempotencyKey.trim();
  if (!key) throw new TypeError("idempotencyKey is required");
  return `${operation}:${key}`;
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "P2034" ||
    (typeof candidate.message === "string" &&
      candidate.message.includes("SQLSTATE 40001"))
  );
}

export function toBillingSummary(account: BillingAccount): BillingSummary {
  return {
    billingAccountId: account.billingAccountId,
    organizationId: account.organizationId,
    currency: account.currency,
    paidBalanceMicros: account.paidBalanceMicros,
    promotionalBalanceMicros: account.promotionalBalanceMicros,
    availableUsageMicros:
      account.paidBalanceMicros + account.promotionalBalanceMicros,
    availablePaidOnlyMicros: account.paidBalanceMicros,
    reservedPaidMicros: account.reservedPaidMicros,
    reservedPromotionalMicros: account.reservedPromotionalMicros,
    reservedTotalMicros:
      account.reservedPaidMicros + account.reservedPromotionalMicros,
    debtMicros: account.debtMicros,
    autoRechargeEnabled: account.autoRechargeEnabled,
    autoRechargeThresholdMicros: account.autoRechargeThresholdMicros,
    autoRechargeAmountMicros: account.autoRechargeAmountMicros,
    hasSavedPaymentMethod: Boolean(account.stripePaymentMethodId),
  };
}

export const walletLedgerService = new WalletLedgerService();

export const ensureBillingAccount =
  walletLedgerService.ensureBillingAccount.bind(walletLedgerService);
export const getBillingSummary =
  walletLedgerService.getBillingSummary.bind(walletLedgerService);
export const grantSignupPromotionalCredit =
  walletLedgerService.grantSignupPromotionalCredit.bind(walletLedgerService);
export const creditPaidBalance =
  walletLedgerService.creditPaidBalance.bind(walletLedgerService);
export const debitPaidBalance =
  walletLedgerService.debitPaidBalance.bind(walletLedgerService);
export const reversePaidCredit =
  walletLedgerService.reversePaidCredit.bind(walletLedgerService);
export const creditUsageAdjustment =
  walletLedgerService.creditUsageAdjustment.bind(walletLedgerService);
export const debitUsageAdjustment =
  walletLedgerService.debitUsageAdjustment.bind(walletLedgerService);
export const reserveUsageCredit =
  walletLedgerService.reserveUsageCredit.bind(walletLedgerService);
export const reservePaidNumberCredit =
  walletLedgerService.reservePaidNumberCredit.bind(walletLedgerService);
export const settleReservation =
  walletLedgerService.settleReservation.bind(walletLedgerService);
export const releaseReservation =
  walletLedgerService.releaseReservation.bind(walletLedgerService);
export const recordOutstandingDebt =
  walletLedgerService.recordOutstandingDebt.bind(walletLedgerService);
export const listBillingTransactions =
  walletLedgerService.listBillingTransactions.bind(walletLedgerService);
