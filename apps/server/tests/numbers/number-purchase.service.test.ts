import assert from "node:assert/strict";
import test from "node:test";

process.env.NUMBER_QUOTE_SIGNING_SECRET = "test-number-purchase-signing-secret";

const {
  BillingReservationPurpose,
  BillingReservationStatus,
  PhoneNumberBillingStatus,
  PhoneNumberPurchaseStatus,
  TelephonyProvider,
} = await import("../../prisma/generated/prisma/client.js");
const { createNumberQuote, verifyNumberQuoteForRecovery } =
  await import("../../src/modules/numbers/number-quote.service.js");
const { NumberPurchaseService } =
  await import("../../src/modules/numbers/number-purchase.service.js");
const { NumberPurchaseRecoveryService } =
  await import("../../src/modules/numbers/number-purchase-maintenance.service.js");
const { InsufficientCreditError } =
  await import("../../src/modules/billing/wallet-ledger.service.js");

import type {
  BillingReservation,
  PhoneNumber,
  PhoneNumberPurchase,
} from "../../prisma/generated/prisma/client.js";
import type { NumberPurchaseWallet } from "../../src/modules/numbers/number-purchase.service.js";
import type {
  NumberPurchaseProviderGateway,
  ProviderPurchaseResult,
} from "../../src/modules/numbers/number-purchase.provider.js";
import type {
  CreateNumberPurchaseInput,
  NumberPurchaseStore,
  PersistPurchasedPhoneInput,
} from "../../src/modules/numbers/number-purchase.repository.js";

const BASE_TIME = new Date("2026-08-01T00:00:00.000Z");

function quote(now = BASE_TIME) {
  return createNumberQuote({
    organizationId: "org-1",
    phoneNumber: "+14155550100",
    provider: TelephonyProvider.TWILIO,
    providerMonthlyCostMicros: 1_000_000n,
    billingCountryIso: "US",
    billingNumberType: "local",
    now,
  });
}

function buyArgs(numberQuote = quote()) {
  return {
    organizationId: "org-1",
    userId: "user-1",
    phoneNumber: numberQuote.phoneNumber,
    provider: numberQuote.provider,
    quoteId: numberQuote.quoteId,
  };
}

function phone(
  phId: string,
  overrides: Partial<PhoneNumber> = {},
): PhoneNumber {
  return {
    phId,
    number: "+14155550100",
    organizationId: "org-1",
    userId: "user-1",
    agentId: null,
    sid: "provider-number-1",
    friendlyName: "+1 415-555-0100",
    provider: TelephonyProvider.TWILIO,
    billingStatus: PhoneNumberBillingStatus.ACTIVE,
    providerMonthlyCostMicros: 1_000_000n,
    rentalPriceMicros: 2_000_000n,
    nextBillingAt: new Date("2026-08-31T00:00:00.000Z"),
    lastBilledAt: BASE_TIME,
    billingSuspendedAt: null,
    scheduledReleaseAt: null,
    billingFailureCount: 0,
    lastBillingAttemptAt: null,
    billingNoticeSentAt: null,
    billingSuspendedAgentId: null,
    billingCountryIso: "US",
    billingNumberType: "local",
    billingRateCatalogVersion: "test",
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  };
}

class MemoryStore implements NumberPurchaseStore {
  purchases = new Map<string, PhoneNumberPurchase>();
  phones = new Map<string, PhoneNumber>();
  reservations = new Map<string, BillingReservation>();

  byNonce(nonce: string) {
    return [...this.purchases.values()].find(
      (purchase) => purchase.quoteNonce === nonce,
    );
  }

  async findByNonce(nonce: string, organizationId: string) {
    const purchase = this.byNonce(nonce);
    return purchase?.organizationId === organizationId ? purchase : null;
  }

  async findActiveByNumber(number: string) {
    const terminal = new Set([
      PhoneNumberPurchaseStatus.SUCCEEDED,
      PhoneNumberPurchaseStatus.FAILED,
    ]);
    return (
      [...this.purchases.values()].find(
        (purchase) =>
          purchase.phoneNumber === number && !terminal.has(purchase.status),
      ) ?? null
    );
  }

  async findPhoneByNumber(number: string) {
    return (
      [...this.phones.values()].find((item) => item.number === number) ?? null
    );
  }

  async findPhoneById(phoneId: string, organizationId: string) {
    const item = this.phones.get(phoneId);
    return item?.organizationId === organizationId ? item : null;
  }

  async findReservation(organizationId: string, idempotencyKey: string) {
    const item = this.reservations.get(idempotencyKey);
    return item?.organizationId === organizationId ? item : null;
  }

  async create(input: CreateNumberPurchaseInput) {
    if (
      this.byNonce(input.quoteNonce) ||
      (await this.findActiveByNumber(input.phoneNumber))
    ) {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    }
    const purchase = {
      ...input,
      status: PhoneNumberPurchaseStatus.PENDING,
      billingReservationId: null,
      providerResourceId: null,
      providerOrderId: null,
      providerFriendlyName: null,
      providerAttemptedAt: null,
      providerPurchasedAt: null,
      phonePersistedAt: null,
      completedAt: null,
      failedAt: null,
      processingToken: null,
      processingExpiresAt: null,
      attemptCount: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    } as PhoneNumberPurchase;
    this.purchases.set(purchase.phoneNumberPurchaseId, purchase);
    return purchase;
  }

  async failExpiredUnfunded(args: { purchaseId: string; now: Date }) {
    const purchase = this.purchases.get(args.purchaseId);
    if (
      !purchase ||
      purchase.status !== PhoneNumberPurchaseStatus.PENDING ||
      purchase.billingReservationId ||
      purchase.quoteExpiresAt > args.now ||
      (purchase.processingToken &&
        purchase.processingExpiresAt &&
        purchase.processingExpiresAt > args.now)
    ) {
      return false;
    }
    Object.assign(purchase, {
      status: PhoneNumberPurchaseStatus.FAILED,
      failedAt: args.now,
    });
    return true;
  }

  async claim(args: {
    purchaseId: string;
    processingToken: string;
    now: Date;
    processingExpiresAt: Date;
  }) {
    const purchase = this.purchases.get(args.purchaseId);
    if (
      !purchase ||
      [
        PhoneNumberPurchaseStatus.SUCCEEDED,
        PhoneNumberPurchaseStatus.FAILED,
        PhoneNumberPurchaseStatus.REQUIRES_ATTENTION,
      ].includes(purchase.status) ||
      (purchase.processingToken &&
        purchase.processingExpiresAt &&
        purchase.processingExpiresAt > args.now)
    ) {
      return null;
    }
    Object.assign(purchase, {
      processingToken: args.processingToken,
      processingExpiresAt: args.processingExpiresAt,
      attemptCount: purchase.attemptCount + 1,
    });
    return purchase;
  }

  private owned(purchaseId: string, processingToken: string) {
    const purchase = this.purchases.get(purchaseId);
    assert.ok(purchase);
    assert.equal(purchase.processingToken, processingToken);
    return purchase;
  }

  async recordReservation(args: {
    purchaseId: string;
    processingToken: string;
    billingReservationId: string;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    Object.assign(purchase, {
      billingReservationId: args.billingReservationId,
      status: PhoneNumberPurchaseStatus.RESERVED,
    });
    return purchase;
  }

  async recordProviderAttempt(args: {
    purchaseId: string;
    processingToken: string;
    attemptedAt: Date;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    purchase.providerAttemptedAt = args.attemptedAt;
    return purchase;
  }

  async recordProviderPending(args: {
    purchaseId: string;
    processingToken: string;
    providerOrderId?: string;
    providerResourceId?: string;
    friendlyName?: string;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    Object.assign(purchase, {
      status: PhoneNumberPurchaseStatus.PROVIDER_PENDING,
      providerOrderId: args.providerOrderId ?? purchase.providerOrderId,
      providerResourceId:
        args.providerResourceId ?? purchase.providerResourceId,
      providerFriendlyName: args.friendlyName ?? purchase.providerFriendlyName,
      processingToken: null,
      processingExpiresAt: null,
    });
    return purchase;
  }

  async recordProviderPurchased(args: {
    purchaseId: string;
    processingToken: string;
    providerResourceId: string;
    providerOrderId?: string;
    friendlyName: string;
    purchasedAt: Date;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    Object.assign(purchase, {
      status: PhoneNumberPurchaseStatus.PROVIDER_PURCHASED,
      providerResourceId: args.providerResourceId,
      providerOrderId: args.providerOrderId ?? null,
      providerFriendlyName: args.friendlyName,
      providerPurchasedAt: args.purchasedAt,
    });
    return purchase;
  }

  async persistPhone(args: {
    purchase: PhoneNumberPurchase;
    processingToken: string;
    input: PersistPurchasedPhoneInput;
  }) {
    const purchase = this.owned(
      args.purchase.phoneNumberPurchaseId,
      args.processingToken,
    );
    let item = this.phones.get(purchase.persistedPhoneNumberId);
    if (!item) {
      item = phone(purchase.persistedPhoneNumberId, {
        number: args.input.phoneNumber,
        organizationId: args.input.organizationId,
        userId: args.input.userId,
        provider: args.input.provider,
        sid: args.input.providerResourceId,
        friendlyName: args.input.friendlyName,
        providerMonthlyCostMicros: args.input.providerMonthlyCostMicros,
        rentalPriceMicros: args.input.rentalPriceMicros,
        billingCountryIso: args.input.billingCountryIso,
        billingNumberType: args.input.billingNumberType,
        billingRateCatalogVersion: args.input.rateCatalogVersion,
      });
      this.phones.set(item.phId, item);
    }
    Object.assign(purchase, {
      status: PhoneNumberPurchaseStatus.NUMBER_PERSISTED,
      phonePersistedAt: args.input.purchasedAt,
    });
    return item;
  }

  async markSucceeded(args: {
    purchaseId: string;
    processingToken: string;
    completedAt: Date;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    Object.assign(purchase, {
      status: PhoneNumberPurchaseStatus.SUCCEEDED,
      completedAt: args.completedAt,
      processingToken: null,
      processingExpiresAt: null,
    });
    return purchase;
  }

  async markFailed(args: {
    purchaseId: string;
    processingToken: string;
    failedAt: Date;
    errorCode: string;
    errorMessage: string;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    Object.assign(purchase, {
      status: PhoneNumberPurchaseStatus.FAILED,
      failedAt: args.failedAt,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
      processingToken: null,
      processingExpiresAt: null,
    });
    return purchase;
  }

  async markRequiresAttention(args: {
    purchaseId: string;
    processingToken: string;
    errorCode: string;
    errorMessage: string;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    Object.assign(purchase, {
      status: PhoneNumberPurchaseStatus.REQUIRES_ATTENTION,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
      processingToken: null,
      processingExpiresAt: null,
    });
    return purchase;
  }

  async recordRecoverableError(args: {
    purchaseId: string;
    processingToken: string;
    errorCode: string;
    errorMessage: string;
  }) {
    const purchase = this.owned(args.purchaseId, args.processingToken);
    Object.assign(purchase, {
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
      processingToken: null,
      processingExpiresAt: null,
    });
    return purchase;
  }
}

function reservation(
  nonce: string,
  status = BillingReservationStatus.ACTIVE,
): BillingReservation {
  return {
    billingReservationId: `reservation-${nonce}`,
    billingAccountId: "billing-1",
    organizationId: "org-1",
    purpose: BillingReservationPurpose.PHONE_NUMBER_PURCHASE,
    status,
    idempotencyKey: `number-purchase:${nonce}`,
    amountMicros: 2_000_000n,
    paidAmountMicros: 2_000_000n,
    promotionalAmountMicros: 0n,
    settledAmountMicros:
      status === BillingReservationStatus.SETTLED ? 2_000_000n : 0n,
    debtIncurredMicros: 0n,
    referenceType: "phone_number_quote",
    referenceId: nonce,
    expiresAt: new Date("2026-08-01T00:30:00.000Z"),
    settledAt: status === BillingReservationStatus.SETTLED ? BASE_TIME : null,
    releasedAt: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };
}

function seedPurchase(
  store: MemoryStore,
  numberQuote: ReturnType<typeof quote>,
  status:
    | typeof PhoneNumberPurchaseStatus.RESERVED
    | typeof PhoneNumberPurchaseStatus.NUMBER_PERSISTED
    | typeof PhoneNumberPurchaseStatus.SUCCEEDED,
) {
  const verified = verifyNumberQuoteForRecovery({
    quoteId: numberQuote.quoteId,
    organizationId: "org-1",
    phoneNumber: numberQuote.phoneNumber,
    provider: numberQuote.provider,
    now: new Date("2026-08-01T01:00:00.000Z"),
  });
  const row = {
    phoneNumberPurchaseId: "purchase-seeded",
    quoteNonce: verified.nonce,
    organizationId: "org-1",
    requestedByUserId: "user-1",
    phoneNumber: verified.phoneNumber,
    provider: verified.provider,
    providerMonthlyCostMicros: verified.providerMonthlyCostMicros,
    rentalPriceMicros: verified.monthlyPriceMicros,
    billingCountryIso: verified.billingCountryIso,
    billingNumberType: verified.billingNumberType,
    rateCatalogVersion: verified.rateCatalogVersion,
    quoteExpiresAt: new Date(verified.expiresAt),
    status,
    billingReservationId: `reservation-${verified.nonce}`,
    providerResourceId:
      status === PhoneNumberPurchaseStatus.RESERVED
        ? null
        : "provider-number-1",
    providerOrderId: null,
    providerFriendlyName: "+1 415-555-0100",
    persistedPhoneNumberId: "phone-seeded",
    providerAttemptedAt:
      status === PhoneNumberPurchaseStatus.RESERVED ? BASE_TIME : BASE_TIME,
    providerPurchasedAt:
      status === PhoneNumberPurchaseStatus.RESERVED ? null : BASE_TIME,
    phonePersistedAt:
      status === PhoneNumberPurchaseStatus.NUMBER_PERSISTED ||
      status === PhoneNumberPurchaseStatus.SUCCEEDED
        ? BASE_TIME
        : null,
    completedAt:
      status === PhoneNumberPurchaseStatus.SUCCEEDED ? BASE_TIME : null,
    failedAt: null,
    processingToken: null,
    processingExpiresAt: null,
    attemptCount: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  } as PhoneNumberPurchase;
  store.purchases.set(row.phoneNumberPurchaseId, row);
  store.reservations.set(
    `number-purchase:${verified.nonce}`,
    reservation(verified.nonce),
  );
  return row;
}

function harness(
  options: {
    now?: Date;
    provider?: NumberPurchaseProviderGateway;
    reserveError?: Error;
  } = {},
) {
  const store = new MemoryStore();
  const calls = {
    reserve: 0,
    settle: 0,
    release: 0,
    purchase: 0,
    recover: 0,
    autoRecharge: 0,
    autoRechargeArgs: null as null | {
      organizationId: string;
      requiredPaidMicros: bigint;
      contextKey: string;
    },
  };
  const wallet: NumberPurchaseWallet = {
    async reserve(args) {
      calls.reserve += 1;
      if (options.reserveError) throw options.reserveError;
      const existing = store.reservations.get(args.idempotencyKey);
      if (existing) return { reservation: existing };
      const item = reservation(args.referenceId!);
      store.reservations.set(args.idempotencyKey, item);
      return { reservation: item };
    },
    async settle(args) {
      calls.settle += 1;
      const item = [...store.reservations.values()].find(
        (candidate) => candidate.billingReservationId === args.reservationId,
      );
      assert.ok(item);
      item.status = BillingReservationStatus.SETTLED;
      item.settledAmountMicros = args.actualAmountMicros;
      return {};
    },
    async release(args) {
      calls.release += 1;
      const item = [...store.reservations.values()].find(
        (candidate) => candidate.billingReservationId === args.reservationId,
      );
      assert.ok(item);
      item.status = BillingReservationStatus.RELEASED;
      return {};
    },
    async triggerAutoRecharge(organizationId, autoOptions) {
      calls.autoRecharge += 1;
      calls.autoRechargeArgs = { organizationId, ...autoOptions };
      return undefined;
    },
  };
  const provider: NumberPurchaseProviderGateway = options.provider ?? {
    async recover() {
      calls.recover += 1;
      return null;
    },
    async purchase() {
      calls.purchase += 1;
      return {
        state: "acquired",
        resourceId: "provider-number-1",
        friendlyName: "+1 415-555-0100",
      };
    },
  };
  let nextId = 0;
  const service = new NumberPurchaseService({
    store,
    wallet,
    providerGateway: provider,
    now: () => options.now ?? BASE_TIME,
    randomId: () => `generated-${++nextId}`,
  });
  return { store, wallet, provider, service, calls };
}

test("sequential quote replay returns the same row without buying or debiting twice", async () => {
  const setup = harness();
  const args = buyArgs();

  const first = await setup.service.purchaseNumber(args);
  const replay = await setup.service.purchaseNumber(args);

  assert.equal(replay.phId, first.phId);
  assert.equal(setup.calls.reserve, 1);
  assert.equal(setup.calls.purchase, 1);
  assert.equal(setup.calls.settle, 1);
});

test("concurrent replay cannot enter the provider or wallet twice", async () => {
  let entered!: () => void;
  let finish!: () => void;
  const providerEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const providerFinish = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let purchaseCalls = 0;
  const setup = harness({
    provider: {
      async recover() {
        return null;
      },
      async purchase() {
        purchaseCalls += 1;
        entered();
        await providerFinish;
        return {
          state: "acquired",
          resourceId: "provider-number-1",
          friendlyName: "+1 415-555-0100",
        };
      },
    },
  });
  const args = buyArgs();

  const first = setup.service.purchaseNumber(args);
  await providerEntered;
  await assert.rejects(
    () => setup.service.purchaseNumber(args),
    (error: unknown) =>
      (error as { code?: string }).code === "NUMBER_PURCHASE_PROCESSING",
  );
  finish();
  await first;

  assert.equal(setup.calls.reserve, 1);
  assert.equal(purchaseCalls, 1);
  assert.equal(setup.calls.settle, 1);
});

test("recovers an acquired provider number after the purchase response was lost", async () => {
  const numberQuote = quote();
  let purchaseCalls = 0;
  let recoverCalls = 0;
  const setup = harness({
    now: new Date("2026-08-01T00:20:00.000Z"),
    provider: {
      async recover(): Promise<ProviderPurchaseResult> {
        recoverCalls += 1;
        return {
          state: "acquired",
          resourceId: "provider-number-1",
          friendlyName: "+1 415-555-0100",
        };
      },
      async purchase() {
        purchaseCalls += 1;
        throw new Error("must not issue a second provider purchase");
      },
    },
  });
  seedPurchase(setup.store, numberQuote, PhoneNumberPurchaseStatus.RESERVED);

  const result = await setup.service.purchaseNumber(buyArgs(numberQuote));

  assert.equal(result.sid, "provider-number-1");
  assert.equal(recoverCalls, 1);
  assert.equal(purchaseCalls, 0);
  assert.equal(setup.calls.settle, 1);
});

test("a pending provider order resumes by lookup without issuing a second order", async () => {
  let purchaseCalls = 0;
  let recoveryCalls = 0;
  const setup = harness({
    provider: {
      async recover() {
        recoveryCalls += 1;
        return {
          state: "acquired",
          resourceId: "provider-number-1",
          orderId: "order-1",
          friendlyName: "+1 415-555-0100",
        };
      },
      async purchase() {
        purchaseCalls += 1;
        return {
          state: "pending",
          orderId: "order-1",
          friendlyName: "+1 415-555-0100",
        };
      },
    },
  });
  const args = buyArgs();

  await assert.rejects(
    () => setup.service.purchaseNumber(args),
    (error: unknown) =>
      (error as { code?: string }).code === "NUMBER_PURCHASE_PROCESSING",
  );
  const result = await setup.service.purchaseNumber(args);

  assert.equal(result.sid, "provider-number-1");
  assert.equal(purchaseCalls, 1);
  assert.equal(recoveryCalls, 1);
  assert.equal(setup.calls.reserve, 1);
  assert.equal(setup.calls.settle, 1);
});

test("background recovery completes an asynchronous provider order without the signed quote", async () => {
  let purchaseCalls = 0;
  let recoveryCalls = 0;
  const setup = harness({
    provider: {
      async recover() {
        recoveryCalls += 1;
        return {
          state: "acquired",
          resourceId: "provider-number-1",
          orderId: "order-background-1",
          friendlyName: "+1 415-555-0100",
        };
      },
      async purchase() {
        purchaseCalls += 1;
        return {
          state: "pending",
          orderId: "order-background-1",
          friendlyName: "+1 415-555-0100",
        };
      },
    },
  });

  await assert.rejects(
    () => setup.service.purchaseNumber(buyArgs()),
    (error: unknown) =>
      (error as { code?: string }).code === "NUMBER_PURCHASE_PROCESSING",
  );
  const purchase = [...setup.store.purchases.values()][0]!;
  assert.equal(purchase.status, PhoneNumberPurchaseStatus.PROVIDER_PENDING);

  const worker = new NumberPurchaseRecoveryService({
    hosted: true,
    now: () => BASE_TIME,
    findClaimable: async () => [
      { phoneNumberPurchaseId: purchase.phoneNumberPurchaseId },
    ],
    resumePurchase: (phoneNumberPurchaseId) =>
      setup.service.resumePurchase(phoneNumberPurchaseId),
  });
  const result = await worker.run();

  assert.deepEqual(result, {
    skipped: false,
    examined: 1,
    recovered: 1,
    contended: 0,
    errors: 0,
  });
  assert.equal(purchase.status, PhoneNumberPurchaseStatus.SUCCEEDED);
  assert.equal(purchaseCalls, 1);
  assert.equal(recoveryCalls, 1);
  assert.equal(setup.calls.reserve, 1);
  assert.equal(setup.calls.settle, 1);
});

test("background recovery cannot duplicate a purchase with an active processing lease", async () => {
  let entered!: () => void;
  let finish!: () => void;
  const providerEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const providerFinish = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let purchaseCalls = 0;
  const setup = harness({
    provider: {
      async recover() {
        return null;
      },
      async purchase() {
        purchaseCalls += 1;
        entered();
        await providerFinish;
        return {
          state: "acquired",
          resourceId: "provider-number-1",
          friendlyName: "+1 415-555-0100",
        };
      },
    },
  });

  const interactivePurchase = setup.service.purchaseNumber(buyArgs());
  await providerEntered;
  const purchase = [...setup.store.purchases.values()][0]!;
  assert.ok(purchase.processingToken);

  // Discovery can race a fresh request after its read. The service-level CAS
  // remains the final guard even if a leased row reaches the worker.
  const worker = new NumberPurchaseRecoveryService({
    hosted: true,
    now: () => BASE_TIME,
    findClaimable: async () => [
      { phoneNumberPurchaseId: purchase.phoneNumberPurchaseId },
    ],
    resumePurchase: (phoneNumberPurchaseId) =>
      setup.service.resumePurchase(phoneNumberPurchaseId),
  });
  const result = await worker.run();

  assert.equal(result.contended, 1);
  assert.equal(result.recovered, 0);
  assert.equal(purchaseCalls, 1);

  finish();
  await interactivePurchase;
  assert.equal(purchaseCalls, 1);
  assert.equal(setup.calls.settle, 1);
});

test("a released reserve prevents provider retry after a failure-boundary crash", async () => {
  const numberQuote = quote();
  let providerCalls = 0;
  const setup = harness({
    now: new Date("2026-08-01T00:20:00.000Z"),
    provider: {
      async recover() {
        providerCalls += 1;
        throw new Error(
          "provider must not be queried without an active reserve",
        );
      },
      async purchase() {
        providerCalls += 1;
        throw new Error(
          "provider must not be called without an active reserve",
        );
      },
    },
  });
  const purchase = seedPurchase(
    setup.store,
    numberQuote,
    PhoneNumberPurchaseStatus.RESERVED,
  );
  setup.store.reservations.get(
    `number-purchase:${purchase.quoteNonce}`,
  )!.status = BillingReservationStatus.RELEASED;

  await assert.rejects(
    () => setup.service.purchaseNumber(buyArgs(numberQuote)),
    (error: unknown) =>
      (error as { code?: string }).code === "NUMBER_PURCHASE_FAILED",
  );
  assert.equal(providerCalls, 0);
  assert.equal(purchase.status, PhoneNumberPurchaseStatus.FAILED);
});

test("resumes settlement after phone persistence without another provider call", async () => {
  const numberQuote = quote();
  const setup = harness();
  const purchase = seedPurchase(
    setup.store,
    numberQuote,
    PhoneNumberPurchaseStatus.NUMBER_PERSISTED,
  );
  setup.store.phones.set(
    purchase.persistedPhoneNumberId,
    phone(purchase.persistedPhoneNumberId),
  );

  const result = await setup.service.purchaseNumber(buyArgs(numberQuote));

  assert.equal(result.phId, purchase.persistedPhoneNumberId);
  assert.equal(setup.calls.purchase, 0);
  assert.equal(setup.calls.recover, 0);
  assert.equal(setup.calls.settle, 1);
});

test("a completed quote remains consumed after the phone number is deleted", async () => {
  const numberQuote = quote();
  const setup = harness();
  seedPurchase(setup.store, numberQuote, PhoneNumberPurchaseStatus.SUCCEEDED);

  await assert.rejects(
    () => setup.service.purchaseNumber(buyArgs(numberQuote)),
    (error: unknown) =>
      (error as { code?: string }).code === "NUMBER_QUOTE_ALREADY_CONSUMED",
  );
  assert.equal(setup.calls.reserve, 0);
  assert.equal(setup.calls.purchase, 0);
  assert.equal(setup.calls.settle, 0);
});

test("a distinct quote cannot race an active purchase for the same number", async () => {
  const firstQuote = quote();
  const secondQuote = quote();
  const setup = harness();
  seedPurchase(setup.store, firstQuote, PhoneNumberPurchaseStatus.RESERVED);

  await assert.rejects(
    () => setup.service.purchaseNumber(buyArgs(secondQuote)),
    (error: unknown) =>
      (error as { code?: string }).code === "PHONE_NUMBER_UNAVAILABLE",
  );
  assert.equal(setup.calls.reserve, 0);
  assert.equal(setup.calls.purchase, 0);
  assert.equal(setup.calls.settle, 0);
});

test("an expired quote can resume a funded saga but cannot create a new one", async () => {
  const numberQuote = quote();
  const later = new Date("2026-08-01T00:20:00.000Z");

  const recoverSetup = harness({ now: later });
  const seeded = seedPurchase(
    recoverSetup.store,
    numberQuote,
    PhoneNumberPurchaseStatus.RESERVED,
  );
  seeded.providerAttemptedAt = null;
  const recovered = await recoverSetup.service.purchaseNumber(
    buyArgs(numberQuote),
  );
  assert.equal(recovered.number, numberQuote.phoneNumber);
  assert.equal(recoverSetup.calls.reserve, 0);
  assert.equal(recoverSetup.calls.purchase, 1);

  const newSetup = harness({ now: later });
  await assert.rejects(
    () => newSetup.service.purchaseNumber(buyArgs(numberQuote)),
    /quote expired/i,
  );
  assert.equal(newSetup.store.purchases.size, 0);
  assert.equal(newSetup.calls.reserve, 0);
});

test("insufficient paid credit requests one bounded purchase-context reload without retrying purchase", async () => {
  const numberQuote = quote();
  const setup = harness({
    reserveError: new InsufficientCreditError(
      numberQuote.monthlyPriceMicros,
      0n,
      BillingReservationPurpose.PHONE_NUMBER_PURCHASE,
    ),
  });

  await assert.rejects(
    () => setup.service.purchaseNumber(buyArgs(numberQuote)),
    (error: unknown) =>
      (error as { code?: string }).code === "INSUFFICIENT_CREDIT",
  );

  assert.equal(setup.calls.reserve, 1);
  assert.equal(setup.calls.purchase, 0);
  assert.equal(setup.calls.autoRecharge, 1);
  assert.deepEqual(setup.calls.autoRechargeArgs, {
    organizationId: "org-1",
    requiredPaidMicros: numberQuote.monthlyPriceMicros,
    contextKey: `number-purchase:${[...setup.store.purchases.values()][0]!.phoneNumberPurchaseId}`,
  });
});
