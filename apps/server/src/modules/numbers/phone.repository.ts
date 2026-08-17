import type { TelephonyProvider } from "../../../prisma/generated/prisma/client.js";
import type { PhoneNumberBillingStatus } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { RELEASING_PHONE_STATUS } from "./number-billing-operation.repository.js";

type CreatePhoneNumberInput = {
  organizationId: string;
  userId: string;
  number: string;
  sid: string;
  friendlyName: string;
  provider: TelephonyProvider;
  billingStatus?: PhoneNumberBillingStatus;
  providerMonthlyCostMicros?: bigint;
  rentalPriceMicros?: bigint;
  nextBillingAt?: Date;
  lastBilledAt?: Date;
  billingRateCatalogVersion?: string;
};

export const listByOrg = async (organizationId: string) => {
  return prisma.phoneNumber.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  });
};

export const createPhoneNumber = async (input: CreatePhoneNumberInput) => {
  return prisma.phoneNumber.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      number: input.number,
      sid: input.sid,
      friendlyName: input.friendlyName,
      provider: input.provider,
      ...(input.billingStatus ? { billingStatus: input.billingStatus } : {}),
      ...(input.providerMonthlyCostMicros !== undefined
        ? { providerMonthlyCostMicros: input.providerMonthlyCostMicros }
        : {}),
      ...(input.rentalPriceMicros !== undefined
        ? { rentalPriceMicros: input.rentalPriceMicros }
        : {}),
      ...(input.nextBillingAt ? { nextBillingAt: input.nextBillingAt } : {}),
      ...(input.lastBilledAt ? { lastBilledAt: input.lastBilledAt } : {}),
      ...(input.billingRateCatalogVersion
        ? { billingRateCatalogVersion: input.billingRateCatalogVersion }
        : {}),
    },
  });
};

export const getByIdForOrg = async (phId: string, organizationId: string) => {
  // findFirst with the composite {phId, organizationId} predicate prevents
  // callers from reading rows that belong to another org.
  return prisma.phoneNumber.findFirst({
    where: { phId, organizationId },
  });
};

export const getByNumberForOrg = async (
  number: string,
  organizationId: string,
) => prisma.phoneNumber.findFirst({ where: { number, organizationId } });

export const linkAgent = async (
  phId: string,
  organizationId: string,
  agentId: string | null,
  priorAgentId: string | null,
) => {
  return prisma.$transaction(async (tx) => {
    // updateMany with the composite predicate is the tenant-safe write — a row
    // owned by another org yields count: 0 instead of being updated. Mirrors
    // the pattern in agent.repository.ts:updateAgent.
    const result = await tx.phoneNumber.updateMany({
      where: { phId, organizationId },
      data: { agentId },
    });
    if (result.count === 0) return null;

    // Recount from the source of truth rather than increment/decrement so stale
    // counter values self-heal on the next link/unlink operation.
    if (priorAgentId !== null) {
      const count = await tx.phoneNumber.count({
        where: { agentId: priorAgentId },
      });
      await tx.agent.update({
        where: { agentId: priorAgentId },
        data: { phoneNumbersCount: count },
      });
    }

    if (agentId !== null) {
      const count = await tx.phoneNumber.count({ where: { agentId } });
      await tx.agent.update({
        where: { agentId },
        data: { phoneNumbersCount: count },
      });
    }

    return tx.phoneNumber.findUnique({ where: { phId } });
  });
};

export const deletePhoneNumber = async (
  phId: string,
  organizationId: string,
) => {
  const result = await prisma.phoneNumber.deleteMany({
    where: { phId, organizationId },
  });
  return result.count > 0;
};

/**
 * Atomically verifies and extends a billing release claim. Call this directly
 * before each slow external release phase; a stale worker whose token was
 * replaced receives null and must not touch the provider.
 */
export const refreshClaimedNumberForRelease = async (args: {
  phId: string;
  organizationId: string;
  operationToken: string;
  leaseUntil: Date;
}) => {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: RELEASING_PHONE_STATUS,
      billingOperationToken: args.operationToken,
      billingReleaseClaimedAt: { not: null },
    },
    data: { billingOperationExpiresAt: args.leaseUntil },
  });
  if (result.count === 0) return null;
  return prisma.phoneNumber.findFirst({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: RELEASING_PHONE_STATUS,
      billingOperationToken: args.operationToken,
      billingReleaseClaimedAt: { not: null },
    },
  });
};

export const deleteClaimedPhoneNumber = async (args: {
  phId: string;
  organizationId: string;
  operationToken: string;
}) => {
  const result = await prisma.phoneNumber.deleteMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: RELEASING_PHONE_STATUS,
      billingOperationToken: args.operationToken,
      billingReleaseClaimedAt: { not: null },
    },
  });
  return result.count > 0;
};
