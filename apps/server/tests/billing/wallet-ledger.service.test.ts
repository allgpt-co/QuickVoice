import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BillingAccount,
  BillingReservation,
  BillingTransaction,
  PromotionalGrant,
} from "../../prisma/generated/prisma/client.js";
import { BillingReservationPurpose } from "../../prisma/generated/prisma/enums.js";
import {
  InsufficientCreditError,
  ReservationStateError,
  WalletLedgerService,
} from "../../src/modules/billing/wallet-ledger.service.js";

test("usage reserves promo first, settlement records debt, and top-ups repay debt", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);

  const promo = await service.grantSignupPromotionalCredit({
    organizationId: "org_1",
    userId: "user_1",
    identityHash: "identity_user_1",
  });
  assert.equal(promo.granted, true);
  assert.equal(promo.account.promotionalBalanceMicros, 5_000_000n);

  await assert.rejects(
    service.reservePaidNumberCredit({
      organizationId: "org_1",
      amountMicros: 2_000_000n,
      idempotencyKey: "number-before-topup",
      purpose: BillingReservationPurpose.PHONE_NUMBER_PURCHASE,
    }),
    (error: unknown) =>
      error instanceof InsufficientCreditError && error.availableMicros === 0n,
  );

  await service.creditPaidBalance({
    organizationId: "org_1",
    amountMicros: 2_000_000n,
    idempotencyKey: "topup_1",
  });
  const reserved = await service.reserveUsageCredit({
    organizationId: "org_1",
    amountMicros: 6_000_000n,
    idempotencyKey: "call_1:reserve:1",
    referenceType: "call",
    referenceId: "call_1",
  });
  assert.equal(reserved.reservation.promotionalAmountMicros, 5_000_000n);
  assert.equal(reserved.reservation.paidAmountMicros, 1_000_000n);
  assert.equal(reserved.account.paidBalanceMicros, 1_000_000n);
  assert.equal(reserved.account.reservedTotalMicros, 6_000_000n);

  const settled = await service.settleReservation({
    organizationId: "org_1",
    reservationId: reserved.reservation.billingReservationId,
    actualAmountMicros: 8_000_000n,
    idempotencyKey: "call_1:settle:1",
  });
  assert.equal(settled.account.paidBalanceMicros, 0n);
  assert.equal(settled.account.promotionalBalanceMicros, 0n);
  assert.equal(settled.account.reservedTotalMicros, 0n);
  assert.equal(settled.account.debtMicros, 1_000_000n);
  assert.equal(settled.reservation.debtIncurredMicros, 1_000_000n);

  const recharged = await service.creditPaidBalance({
    organizationId: "org_1",
    amountMicros: 5_000_000n,
    idempotencyKey: "topup_2",
  });
  assert.equal(recharged.account.debtMicros, 0n);
  assert.equal(recharged.account.paidBalanceMicros, 4_000_000n);
  assert.equal(recharged.transaction.debtDeltaMicros, -1_000_000n);
});

test("refund reversals never consume promo, record shortfall debt, and are idempotent", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);

  await service.grantSignupPromotionalCredit({
    organizationId: "org_1",
    userId: "user_1",
    identityHash: "identity_user_1",
  });
  await service.creditPaidBalance({
    organizationId: "org_1",
    amountMicros: 4_000_000n,
    idempotencyKey: "topup_1",
  });

  const reversalArgs = {
    organizationId: "org_1",
    amountMicros: 6_000_000n,
    idempotencyKey: "refund_1:6000000",
    type: "REFUND" as const,
    referenceType: "stripe_payment_intent",
    referenceId: "pi_1",
  };
  const first = await service.debitPaidBalance(reversalArgs);
  const duplicate = await service.debitPaidBalance(reversalArgs);

  assert.equal(first.account.paidBalanceMicros, 0n);
  assert.equal(first.account.promotionalBalanceMicros, 5_000_000n);
  assert.equal(first.account.debtMicros, 2_000_000n);
  assert.equal(duplicate.account.debtMicros, 2_000_000n);
  assert.equal(
    fake.transactions.filter((transaction) => transaction.type === "REFUND")
      .length,
    1,
  );
});

test("signup promotion is unique to a user even when requested for another org", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);

  const first = await service.grantSignupPromotionalCredit({
    organizationId: "org_1",
    userId: "user_1",
    identityHash: "identity_user_1",
  });
  const second = await service.grantSignupPromotionalCredit({
    organizationId: "org_2",
    userId: "user_1",
    identityHash: "identity_user_1",
  });

  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.equal(second.account.organizationId, "org_1");
  assert.equal(fake.grants.length, 1);
});

test("signup promotion is unique to an organization across different owners", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);

  const first = await service.grantSignupPromotionalCredit({
    organizationId: "org_1",
    userId: "user_1",
    identityHash: "identity_user_1",
  });
  const second = await service.grantSignupPromotionalCredit({
    organizationId: "org_1",
    userId: "user_2",
    identityHash: "identity_user_2",
  });

  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.equal(second.account.organizationId, "org_1");
  assert.equal(fake.grants.length, 1);
});

test("a deleted workspace leaves a durable identity tombstone that denies another grant", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);
  await service.grantSignupPromotionalCredit({
    organizationId: "org_1",
    userId: "user_1",
    identityHash: "same_verified_email",
  });

  // Mirrors ON DELETE SET NULL after the original organization/account/ledger
  // are removed while the promotion claim itself survives.
  Object.assign(fake.grants[0]!, {
    userId: null,
    organizationId: null,
    billingAccountId: null,
    billingTransactionId: null,
  });
  fake.accounts.splice(0);
  fake.transactions.splice(0);

  const retried = await service.grantSignupPromotionalCredit({
    organizationId: "org_2",
    userId: "user_2",
    identityHash: "same_verified_email",
  });
  assert.equal(retried.granted, false);
  assert.equal(retried.account.organizationId, "org_2");
  assert.equal(retried.transaction, null);
  assert.equal(fake.grants.length, 1);
});

test("usage adjustment clears debt and restores the original credit buckets", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);

  await service.recordOutstandingDebt({
    organizationId: "org_1",
    amountMicros: 1_000_000n,
    idempotencyKey: "provider-overage",
  });
  const adjusted = await service.creditUsageAdjustment({
    organizationId: "org_1",
    paidAmountMicros: 200_000n,
    promotionalAmountMicros: 1_300_000n,
    idempotencyKey: "provider-reconciliation",
  });

  assert.equal(adjusted.account.debtMicros, 0n);
  assert.equal(adjusted.account.paidBalanceMicros, 0n);
  assert.equal(adjusted.account.promotionalBalanceMicros, 500_000n);
  assert.equal(adjusted.transaction.debtDeltaMicros, -1_000_000n);
  assert.equal(adjusted.transaction.promotionalBalanceDeltaMicros, 500_000n);
});

test("usage reconciliation debit consumes promo then paid and records only the shortfall as debt", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);
  await service.grantSignupPromotionalCredit({
    organizationId: "org_1",
    userId: "user_1",
    identityHash: "identity_user_1",
  });
  await service.creditPaidBalance({
    organizationId: "org_1",
    amountMicros: 1_000_000n,
    idempotencyKey: "topup_1",
  });

  const charged = await service.debitUsageAdjustment({
    organizationId: "org_1",
    amountMicros: 7_000_000n,
    idempotencyKey: "call_1:provider-final",
    referenceType: "call",
    referenceId: "call_1",
  });
  assert.equal(charged.account.promotionalBalanceMicros, 0n);
  assert.equal(charged.account.paidBalanceMicros, 0n);
  assert.equal(charged.account.debtMicros, 1_000_000n);
});

test("a released idempotent reservation cannot authorize funds again", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);
  await service.creditPaidBalance({
    organizationId: "org_1",
    amountMicros: 2_000_000n,
    idempotencyKey: "topup_1",
  });
  const first = await service.reserveUsageCredit({
    organizationId: "org_1",
    amountMicros: 1_000_000n,
    idempotencyKey: "call_1:reserve:1",
    expiresAt: new Date(Date.now() + 60_000),
  });
  await service.releaseReservation({
    organizationId: "org_1",
    reservationId: first.reservation.billingReservationId,
    idempotencyKey: "call_1:release:1",
  });

  await assert.rejects(
    service.reserveUsageCredit({
      organizationId: "org_1",
      amountMicros: 1_000_000n,
      idempotencyKey: "call_1:reserve:1",
      expiresAt: new Date(Date.now() + 60_000),
    }),
    (error: unknown) =>
      error instanceof ReservationStateError && error.status === "RELEASED",
  );
});

test("an expired active idempotent reservation is atomically renewed", async () => {
  const fake = createBillingDatabase();
  const service = new WalletLedgerService(fake.database);
  await service.creditPaidBalance({
    organizationId: "org_1",
    amountMicros: 2_000_000n,
    idempotencyKey: "topup_1",
  });
  await service.reserveUsageCredit({
    organizationId: "org_1",
    amountMicros: 1_000_000n,
    idempotencyKey: "call_1:reserve:1",
    expiresAt: new Date(Date.now() - 1_000),
  });
  const renewedUntil = new Date(Date.now() + 60_000);

  const retried = await service.reserveUsageCredit({
    organizationId: "org_1",
    amountMicros: 1_000_000n,
    idempotencyKey: "call_1:reserve:1",
    expiresAt: renewedUntil,
  });

  assert.equal(retried.reservation.status, "ACTIVE");
  assert.equal(
    retried.reservation.expiresAt?.getTime(),
    renewedUntil.getTime(),
  );
  assert.equal(fake.reservations.length, 1);
});

function createBillingDatabase() {
  let id = 0;
  const accounts: BillingAccount[] = [];
  const transactions: BillingTransaction[] = [];
  const reservations: BillingReservation[] = [];
  const grants: PromotionalGrant[] = [];
  const nextId = (prefix: string) => `${prefix}_${++id}`;
  const now = () => new Date("2026-08-01T00:00:00.000Z");

  const accountDelegate = {
    upsert: async ({ where, create }: any) => {
      let account = accounts.find(
        (item) => item.organizationId === where.organizationId,
      );
      if (!account) {
        account = {
          billingAccountId: nextId("ba"),
          organizationId: create.organizationId,
          currency: "USD",
          paidBalanceMicros: 0n,
          promotionalBalanceMicros: 0n,
          reservedPaidMicros: 0n,
          reservedPromotionalMicros: 0n,
          debtMicros: 0n,
          autoRechargeEnabled: false,
          autoRechargeThresholdMicros: 5_000_000n,
          autoRechargeAmountMicros: 20_000_000n,
          stripePaymentMethodId: null,
          paymentMethodRequestVersion: 0,
          paymentMethodAppliedVersion: 0,
          createdAt: now(),
          updatedAt: now(),
        };
        accounts.push(account);
      }
      return { ...account };
    },
    findUnique: async ({ where }: any) => {
      const account = accounts.find(
        (item) =>
          item.organizationId === where.organizationId ||
          item.billingAccountId === where.billingAccountId,
      );
      return account ? { ...account } : null;
    },
    findUniqueOrThrow: async (args: any) => {
      const account = await accountDelegate.findUnique(args);
      if (!account) throw new Error("account not found");
      return account;
    },
    update: async ({ where, data }: any) => {
      const account = accounts.find(
        (item) => item.billingAccountId === where.billingAccountId,
      );
      if (!account) throw new Error("account not found");
      Object.assign(account, data, { updatedAt: now() });
      return { ...account };
    },
  };

  const transactionDelegate = {
    findUnique: async ({ where }: any) => {
      const composite = where.billingAccountId_idempotencyKey;
      const transaction = transactions.find((item) =>
        composite
          ? item.billingAccountId === composite.billingAccountId &&
            item.idempotencyKey === composite.idempotencyKey
          : item.billingTransactionId === where.billingTransactionId,
      );
      return transaction ? { ...transaction } : null;
    },
    findUniqueOrThrow: async (args: any) => {
      const transaction = await transactionDelegate.findUnique(args);
      if (!transaction) throw new Error("transaction not found");
      return transaction;
    },
    create: async ({ data }: any) => {
      const transaction = {
        billingTransactionId: nextId("txn"),
        createdAt: now(),
        referenceType: null,
        referenceId: null,
        description: null,
        metadata: null,
        ...data,
      } as BillingTransaction;
      transactions.push(transaction);
      return { ...transaction };
    },
    findMany: async () =>
      transactions.map((transaction) => ({ ...transaction })),
  };

  const reservationDelegate = {
    findUnique: async ({ where }: any) => {
      const composite = where.billingAccountId_idempotencyKey;
      const reservation = reservations.find((item) =>
        composite
          ? item.billingAccountId === composite.billingAccountId &&
            item.idempotencyKey === composite.idempotencyKey
          : item.billingReservationId === where.billingReservationId,
      );
      return reservation ? { ...reservation } : null;
    },
    findUniqueOrThrow: async (args: any) => {
      const reservation = await reservationDelegate.findUnique(args);
      if (!reservation) throw new Error("reservation not found");
      return reservation;
    },
    findFirstOrThrow: async ({ where }: any) => {
      const reservation = reservations.find(
        (item) =>
          item.billingReservationId === where.billingReservationId &&
          item.organizationId === where.organizationId,
      );
      if (!reservation) throw new Error("reservation not found");
      return { ...reservation };
    },
    create: async ({ data }: any) => {
      const reservation = {
        billingReservationId: nextId("reserve"),
        status: "ACTIVE",
        settledAmountMicros: 0n,
        debtIncurredMicros: 0n,
        referenceType: null,
        referenceId: null,
        expiresAt: null,
        settledAt: null,
        releasedAt: null,
        createdAt: now(),
        updatedAt: now(),
        ...data,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        expiresAt: data.expiresAt ?? null,
      } as BillingReservation;
      reservations.push(reservation);
      return { ...reservation };
    },
    update: async ({ where, data }: any) => {
      const reservation = reservations.find(
        (item) => item.billingReservationId === where.billingReservationId,
      );
      if (!reservation) throw new Error("reservation not found");
      Object.assign(reservation, data, { updatedAt: now() });
      return { ...reservation };
    },
    updateMany: async ({ where, data }: any) => {
      const reservation = reservations.find(
        (item) =>
          item.billingReservationId === where.billingReservationId &&
          item.status === where.status &&
          (!where.expiresAt?.lte ||
            (item.expiresAt && item.expiresAt <= where.expiresAt.lte)),
      );
      if (!reservation) return { count: 0 };
      Object.assign(reservation, data, { updatedAt: now() });
      return { count: 1 };
    },
  };

  const promotionDelegate = {
    findFirst: async ({ where }: any) => {
      const grant = grants.find((item) =>
        (where.OR ?? []).some(
          (candidate: {
            userId?: string;
            organizationId?: string;
            identityHash?: string;
          }) =>
            (candidate.userId && item.userId === candidate.userId) ||
            (candidate.organizationId &&
              item.organizationId === candidate.organizationId) ||
            (candidate.identityHash &&
              item.identityHash === candidate.identityHash),
        ),
      );
      return grant ? { ...grant } : null;
    },
    findUnique: async ({ where }: any) => {
      const grant = grants.find((item) => item.userId === where.userId);
      return grant ? { ...grant } : null;
    },
    create: async ({ data }: any) => {
      const grant = {
        promotionalGrantId: nextId("promo"),
        grantedAt: now(),
        ...data,
      } as PromotionalGrant;
      grants.push(grant);
      return { ...grant };
    },
  };

  const tx = {
    billingAccount: accountDelegate,
    billingTransaction: transactionDelegate,
    billingReservation: reservationDelegate,
    promotionalGrant: promotionDelegate,
  };
  const database = {
    ...tx,
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as ConstructorParameters<typeof WalletLedgerService>[0];

  return { database, accounts, transactions, reservations, grants };
}
