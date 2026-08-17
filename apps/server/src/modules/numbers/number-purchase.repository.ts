import {
  PhoneNumberBillingStatus,
  PhoneNumberPurchaseStatus,
  Prisma,
  type BillingReservation,
  type PhoneNumber,
  type PhoneNumberPurchase,
  type TelephonyProvider,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";

const ACTIVE_PURCHASE_STATUSES = [
  PhoneNumberPurchaseStatus.PENDING,
  PhoneNumberPurchaseStatus.RESERVED,
  PhoneNumberPurchaseStatus.PROVIDER_PENDING,
  PhoneNumberPurchaseStatus.PROVIDER_PURCHASED,
  PhoneNumberPurchaseStatus.NUMBER_PERSISTED,
  PhoneNumberPurchaseStatus.REQUIRES_ATTENTION,
];

const CLAIMABLE_PURCHASE_STATUSES = [
  PhoneNumberPurchaseStatus.PENDING,
  PhoneNumberPurchaseStatus.RESERVED,
  PhoneNumberPurchaseStatus.PROVIDER_PENDING,
  PhoneNumberPurchaseStatus.PROVIDER_PURCHASED,
  PhoneNumberPurchaseStatus.NUMBER_PERSISTED,
];

export type CreateNumberPurchaseInput = {
  phoneNumberPurchaseId: string;
  quoteNonce: string;
  organizationId: string;
  requestedByUserId: string;
  phoneNumber: string;
  provider: TelephonyProvider;
  providerMonthlyCostMicros: bigint;
  rentalPriceMicros: bigint;
  billingCountryIso: string;
  billingNumberType: string;
  rateCatalogVersion: string;
  quoteExpiresAt: Date;
  persistedPhoneNumberId: string;
};

export type PersistPurchasedPhoneInput = {
  organizationId: string;
  userId: string | null;
  phoneNumber: string;
  provider: TelephonyProvider;
  providerResourceId: string;
  friendlyName: string;
  providerMonthlyCostMicros: bigint;
  rentalPriceMicros: bigint;
  billingCountryIso: string;
  billingNumberType: string;
  rateCatalogVersion: string;
  purchasedAt: Date;
};

export class NumberPurchaseLeaseLostError extends Error {
  constructor() {
    super("Phone number purchase processing lease was lost");
    this.name = "NumberPurchaseLeaseLostError";
  }
}

export class NumberPurchasePersistenceConflictError extends Error {
  constructor() {
    super("Phone number is already persisted by another purchase");
    this.name = "NumberPurchasePersistenceConflictError";
  }
}

export interface NumberPurchaseStore {
  findByNonce(
    quoteNonce: string,
    organizationId: string,
  ): Promise<PhoneNumberPurchase | null>;
  findActiveByNumber(phoneNumber: string): Promise<PhoneNumberPurchase | null>;
  findPhoneByNumber(phoneNumber: string): Promise<PhoneNumber | null>;
  findPhoneById(
    phoneNumberId: string,
    organizationId: string,
  ): Promise<PhoneNumber | null>;
  findReservation(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<BillingReservation | null>;
  create(input: CreateNumberPurchaseInput): Promise<PhoneNumberPurchase>;
  failExpiredUnfunded(args: {
    purchaseId: string;
    now: Date;
  }): Promise<boolean>;
  claim(args: {
    purchaseId: string;
    processingToken: string;
    now: Date;
    processingExpiresAt: Date;
  }): Promise<PhoneNumberPurchase | null>;
  recordReservation(args: {
    purchaseId: string;
    processingToken: string;
    billingReservationId: string;
  }): Promise<PhoneNumberPurchase>;
  recordProviderAttempt(args: {
    purchaseId: string;
    processingToken: string;
    attemptedAt: Date;
  }): Promise<PhoneNumberPurchase>;
  recordProviderPending(args: {
    purchaseId: string;
    processingToken: string;
    providerOrderId?: string;
    providerResourceId?: string;
    friendlyName?: string;
  }): Promise<PhoneNumberPurchase>;
  recordProviderPurchased(args: {
    purchaseId: string;
    processingToken: string;
    providerResourceId: string;
    providerOrderId?: string;
    friendlyName: string;
    purchasedAt: Date;
  }): Promise<PhoneNumberPurchase>;
  persistPhone(args: {
    purchase: PhoneNumberPurchase;
    processingToken: string;
    input: PersistPurchasedPhoneInput;
  }): Promise<PhoneNumber>;
  markSucceeded(args: {
    purchaseId: string;
    processingToken: string;
    completedAt: Date;
  }): Promise<PhoneNumberPurchase>;
  markFailed(args: {
    purchaseId: string;
    processingToken: string;
    failedAt: Date;
    errorCode: string;
    errorMessage: string;
  }): Promise<PhoneNumberPurchase>;
  markRequiresAttention(args: {
    purchaseId: string;
    processingToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<PhoneNumberPurchase>;
  recordRecoverableError(args: {
    purchaseId: string;
    processingToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<PhoneNumberPurchase>;
}

async function findByNonce(quoteNonce: string, organizationId: string) {
  return prisma.phoneNumberPurchase.findFirst({
    where: { quoteNonce, organizationId },
  });
}

async function findActiveByNumber(phoneNumber: string) {
  return prisma.phoneNumberPurchase.findFirst({
    where: { phoneNumber, status: { in: ACTIVE_PURCHASE_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
}

async function findPhoneByNumber(phoneNumber: string) {
  return prisma.phoneNumber.findUnique({ where: { number: phoneNumber } });
}

async function findPhoneById(phoneNumberId: string, organizationId: string) {
  return prisma.phoneNumber.findFirst({
    where: { phId: phoneNumberId, organizationId },
  });
}

async function findReservation(organizationId: string, idempotencyKey: string) {
  return prisma.billingReservation.findFirst({
    where: { organizationId, idempotencyKey },
  });
}

async function create(input: CreateNumberPurchaseInput) {
  return prisma.phoneNumberPurchase.create({ data: input });
}

async function failExpiredUnfunded(args: { purchaseId: string; now: Date }) {
  const result = await prisma.phoneNumberPurchase.updateMany({
    where: {
      phoneNumberPurchaseId: args.purchaseId,
      status: PhoneNumberPurchaseStatus.PENDING,
      billingReservationId: null,
      quoteExpiresAt: { lte: args.now },
      OR: [
        { processingToken: null },
        { processingExpiresAt: null },
        { processingExpiresAt: { lte: args.now } },
      ],
    },
    data: {
      status: PhoneNumberPurchaseStatus.FAILED,
      failedAt: args.now,
      processingToken: null,
      processingExpiresAt: null,
      lastErrorCode: "QUOTE_EXPIRED_BEFORE_RESERVATION",
      lastErrorMessage: "The quote expired before funds were reserved",
    },
  });
  return result.count > 0;
}

async function claim(args: {
  purchaseId: string;
  processingToken: string;
  now: Date;
  processingExpiresAt: Date;
}) {
  const result = await prisma.phoneNumberPurchase.updateMany({
    where: {
      phoneNumberPurchaseId: args.purchaseId,
      status: { in: CLAIMABLE_PURCHASE_STATUSES },
      OR: [
        { processingToken: null },
        { processingExpiresAt: null },
        { processingExpiresAt: { lte: args.now } },
      ],
    },
    data: {
      processingToken: args.processingToken,
      processingExpiresAt: args.processingExpiresAt,
      attemptCount: { increment: 1 },
    },
  });
  if (result.count === 0) return null;
  return prisma.phoneNumberPurchase.findUniqueOrThrow({
    where: { phoneNumberPurchaseId: args.purchaseId },
  });
}

async function updateOwned(
  purchaseId: string,
  processingToken: string,
  data: Prisma.PhoneNumberPurchaseUpdateManyMutationInput,
) {
  const result = await prisma.phoneNumberPurchase.updateMany({
    where: { phoneNumberPurchaseId: purchaseId, processingToken },
    data,
  });
  if (result.count === 0) throw new NumberPurchaseLeaseLostError();
  return prisma.phoneNumberPurchase.findUniqueOrThrow({
    where: { phoneNumberPurchaseId: purchaseId },
  });
}

function recordReservation(args: {
  purchaseId: string;
  processingToken: string;
  billingReservationId: string;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    billingReservationId: args.billingReservationId,
    status: PhoneNumberPurchaseStatus.RESERVED,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

function recordProviderAttempt(args: {
  purchaseId: string;
  processingToken: string;
  attemptedAt: Date;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    providerAttemptedAt: args.attemptedAt,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

function recordProviderPending(args: {
  purchaseId: string;
  processingToken: string;
  providerOrderId?: string;
  providerResourceId?: string;
  friendlyName?: string;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    status: PhoneNumberPurchaseStatus.PROVIDER_PENDING,
    ...(args.providerOrderId ? { providerOrderId: args.providerOrderId } : {}),
    ...(args.providerResourceId
      ? { providerResourceId: args.providerResourceId }
      : {}),
    ...(args.friendlyName ? { providerFriendlyName: args.friendlyName } : {}),
    processingToken: null,
    processingExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

function recordProviderPurchased(args: {
  purchaseId: string;
  processingToken: string;
  providerResourceId: string;
  providerOrderId?: string;
  friendlyName: string;
  purchasedAt: Date;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    status: PhoneNumberPurchaseStatus.PROVIDER_PURCHASED,
    providerResourceId: args.providerResourceId,
    ...(args.providerOrderId ? { providerOrderId: args.providerOrderId } : {}),
    providerFriendlyName: args.friendlyName,
    providerPurchasedAt: args.purchasedAt,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

async function persistPhone(args: {
  purchase: PhoneNumberPurchase;
  processingToken: string;
  input: PersistPurchasedPhoneInput;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.phoneNumberPurchase.findUniqueOrThrow({
        where: {
          phoneNumberPurchaseId: args.purchase.phoneNumberPurchaseId,
        },
      });
      if (current.processingToken !== args.processingToken) {
        throw new NumberPurchaseLeaseLostError();
      }

      let phone = await tx.phoneNumber.findUnique({
        where: { phId: current.persistedPhoneNumberId },
      });
      if (phone) {
        if (
          phone.organizationId !== args.input.organizationId ||
          phone.number !== args.input.phoneNumber ||
          phone.provider !== args.input.provider ||
          phone.sid !== args.input.providerResourceId
        ) {
          throw new NumberPurchasePersistenceConflictError();
        }
      } else {
        const numberOwner = await tx.phoneNumber.findUnique({
          where: { number: args.input.phoneNumber },
        });
        if (numberOwner) throw new NumberPurchasePersistenceConflictError();

        phone = await tx.phoneNumber.create({
          data: {
            phId: current.persistedPhoneNumberId,
            organizationId: args.input.organizationId,
            userId: args.input.userId,
            number: args.input.phoneNumber,
            sid: args.input.providerResourceId,
            friendlyName: args.input.friendlyName,
            provider: args.input.provider,
            billingStatus: PhoneNumberBillingStatus.ACTIVE,
            providerMonthlyCostMicros: args.input.providerMonthlyCostMicros,
            rentalPriceMicros: args.input.rentalPriceMicros,
            billingCountryIso: args.input.billingCountryIso,
            billingNumberType: args.input.billingNumberType,
            billingRateCatalogVersion: args.input.rateCatalogVersion,
            lastBilledAt: args.input.purchasedAt,
            nextBillingAt: new Date(
              args.input.purchasedAt.getTime() + 30 * 24 * 60 * 60 * 1_000,
            ),
          },
        });
      }

      const updated = await tx.phoneNumberPurchase.updateMany({
        where: {
          phoneNumberPurchaseId: current.phoneNumberPurchaseId,
          processingToken: args.processingToken,
        },
        data: {
          status: PhoneNumberPurchaseStatus.NUMBER_PERSISTED,
          phonePersistedAt: args.input.purchasedAt,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (updated.count === 0) throw new NumberPurchaseLeaseLostError();
      return phone;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new NumberPurchasePersistenceConflictError();
    }
    throw error;
  }
}

function markSucceeded(args: {
  purchaseId: string;
  processingToken: string;
  completedAt: Date;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    status: PhoneNumberPurchaseStatus.SUCCEEDED,
    completedAt: args.completedAt,
    processingToken: null,
    processingExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

function markFailed(args: {
  purchaseId: string;
  processingToken: string;
  failedAt: Date;
  errorCode: string;
  errorMessage: string;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    status: PhoneNumberPurchaseStatus.FAILED,
    failedAt: args.failedAt,
    processingToken: null,
    processingExpiresAt: null,
    lastErrorCode: args.errorCode,
    lastErrorMessage: args.errorMessage,
  });
}

function markRequiresAttention(args: {
  purchaseId: string;
  processingToken: string;
  errorCode: string;
  errorMessage: string;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    status: PhoneNumberPurchaseStatus.REQUIRES_ATTENTION,
    processingToken: null,
    processingExpiresAt: null,
    lastErrorCode: args.errorCode,
    lastErrorMessage: args.errorMessage,
  });
}

function recordRecoverableError(args: {
  purchaseId: string;
  processingToken: string;
  errorCode: string;
  errorMessage: string;
}) {
  return updateOwned(args.purchaseId, args.processingToken, {
    processingToken: null,
    processingExpiresAt: null,
    lastErrorCode: args.errorCode,
    lastErrorMessage: args.errorMessage,
  });
}

export const numberPurchaseStore: NumberPurchaseStore = {
  findByNonce,
  findActiveByNumber,
  findPhoneByNumber,
  findPhoneById,
  findReservation,
  create,
  failExpiredUnfunded,
  claim,
  recordReservation,
  recordProviderAttempt,
  recordProviderPending,
  recordProviderPurchased,
  persistPhone,
  markSucceeded,
  markFailed,
  markRequiresAttention,
  recordRecoverableError,
};
