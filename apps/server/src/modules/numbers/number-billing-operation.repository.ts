import {
  PhoneNumberBillingStatus,
  Prisma,
  type PhoneNumber,
  type TelephonyProvider,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";

export const RELEASING_PHONE_STATUS = "RELEASING" as PhoneNumberBillingStatus;

const RENEWAL_STATUSES = [
  PhoneNumberBillingStatus.ACTIVE,
  PhoneNumberBillingStatus.SUSPENDED,
  PhoneNumberBillingStatus.RELEASE_PENDING,
];

const CLAIMED_RENEWAL_STATUSES = [...RENEWAL_STATUSES, RELEASING_PHONE_STATUS];

export type CompleteRenewalInput = {
  providerMonthlyCostMicros: bigint;
  rentalPriceMicros: bigint;
  billingRateCatalogVersion: string;
  lastBilledAt: Date;
  nextBillingAt: Date;
  billingCountryIso: string | null;
  billingNumberType: string | null;
};

export interface NumberBillingOperationStore {
  listReleaseCandidates(now: Date): Promise<PhoneNumber[]>;
  claimRenewal(args: {
    phId: string;
    organizationId: string;
    expectedNextBillingAt: Date;
    token: string;
    now: Date;
    leaseUntil: Date;
  }): Promise<PhoneNumber | null>;
  claimRelease(args: {
    phId: string;
    organizationId: string;
    token: string;
    now: Date;
    leaseUntil: Date;
  }): Promise<PhoneNumber | null>;
  authorizeRelease(args: {
    phId: string;
    organizationId: string;
    token: string;
    now: Date;
    leaseUntil: Date;
  }): Promise<boolean>;
  refreshOperation(args: {
    phId: string;
    organizationId: string;
    token: string;
    leaseUntil: Date;
  }): Promise<boolean>;
  completeRenewal(args: {
    phId: string;
    organizationId: string;
    token: string;
    input: CompleteRenewalInput;
  }): Promise<boolean>;
  suspendClaimed(args: {
    number: PhoneNumber;
    token: string;
    now: Date;
    scheduledReleaseAt: Date;
  }): Promise<boolean>;
  recordRenewalFailure(args: {
    phId: string;
    organizationId: string;
    token: string;
    now: Date;
  }): Promise<boolean>;
  revertReleaseClaim(args: {
    phId: string;
    organizationId: string;
    token: string;
    now: Date;
  }): Promise<boolean>;
}

function operationIsAvailable(now: Date): Prisma.PhoneNumberWhereInput {
  return {
    OR: [
      { billingOperationToken: null },
      { billingOperationExpiresAt: null },
      { billingOperationExpiresAt: { lte: now } },
    ],
  };
}

async function listReleaseCandidates(now: Date) {
  return prisma.phoneNumber.findMany({
    where: {
      OR: [
        {
          billingStatus: PhoneNumberBillingStatus.RELEASE_PENDING,
          scheduledReleaseAt: { lte: now },
        },
        {
          billingStatus: RELEASING_PHONE_STATUS,
          billingOperationExpiresAt: { lte: now },
        },
      ],
    },
    orderBy: { scheduledReleaseAt: "asc" },
  });
}

async function claimRenewal(args: {
  phId: string;
  organizationId: string;
  expectedNextBillingAt: Date;
  token: string;
  now: Date;
  leaseUntil: Date;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      nextBillingAt: args.expectedNextBillingAt,
      billingStatus: { in: RENEWAL_STATUSES },
      AND: [
        {
          OR: [
            { scheduledReleaseAt: null },
            { scheduledReleaseAt: { gt: args.now } },
          ],
        },
        operationIsAvailable(args.now),
      ],
    },
    data: {
      billingOperationToken: args.token,
      billingOperationExpiresAt: args.leaseUntil,
    },
  });
  if (result.count === 0) return null;
  return prisma.phoneNumber.findFirst({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingOperationToken: args.token,
    },
  });
}

async function claimRelease(args: {
  phId: string;
  organizationId: string;
  token: string;
  now: Date;
  leaseUntil: Date;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      OR: [
        {
          billingStatus: PhoneNumberBillingStatus.RELEASE_PENDING,
          scheduledReleaseAt: { lte: args.now },
          AND: [operationIsAvailable(args.now)],
        },
        {
          billingStatus: RELEASING_PHONE_STATUS,
          billingOperationExpiresAt: { lte: args.now },
        },
      ],
    },
    data: {
      billingStatus: RELEASING_PHONE_STATUS,
      billingOperationToken: args.token,
      billingOperationExpiresAt: args.leaseUntil,
    },
  });
  if (result.count === 0) return null;
  return prisma.phoneNumber.findFirst({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: RELEASING_PHONE_STATUS,
      billingOperationToken: args.token,
    },
  });
}

async function authorizeRelease(args: {
  phId: string;
  organizationId: string;
  token: string;
  now: Date;
  leaseUntil: Date;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: RELEASING_PHONE_STATUS,
      billingOperationToken: args.token,
      billingReleaseClaimedAt: null,
    },
    data: {
      billingReleaseClaimedAt: args.now,
      billingOperationExpiresAt: args.leaseUntil,
    },
  });
  return result.count > 0;
}

async function refreshOperation(args: {
  phId: string;
  organizationId: string;
  token: string;
  leaseUntil: Date;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: { in: CLAIMED_RENEWAL_STATUSES },
      billingOperationToken: args.token,
    },
    data: { billingOperationExpiresAt: args.leaseUntil },
  });
  return result.count > 0;
}

async function completeRenewal(args: {
  phId: string;
  organizationId: string;
  token: string;
  input: CompleteRenewalInput;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: { in: CLAIMED_RENEWAL_STATUSES },
      billingOperationToken: args.token,
    },
    data: {
      billingStatus: PhoneNumberBillingStatus.ACTIVE,
      providerMonthlyCostMicros: args.input.providerMonthlyCostMicros,
      rentalPriceMicros: args.input.rentalPriceMicros,
      billingRateCatalogVersion: args.input.billingRateCatalogVersion,
      lastBilledAt: args.input.lastBilledAt,
      nextBillingAt: args.input.nextBillingAt,
      billingSuspendedAt: null,
      scheduledReleaseAt: null,
      billingFailureCount: 0,
      lastBillingAttemptAt: args.input.lastBilledAt,
      billingCountryIso: args.input.billingCountryIso,
      billingNumberType: args.input.billingNumberType,
      billingOperationToken: null,
      billingOperationExpiresAt: null,
      billingReleaseClaimedAt: null,
    },
  });
  return result.count > 0;
}

async function suspendClaimed(args: {
  number: PhoneNumber;
  token: string;
  now: Date;
  scheduledReleaseAt: Date;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.number.phId,
      organizationId: args.number.organizationId,
      billingStatus: { in: RENEWAL_STATUSES },
      billingOperationToken: args.token,
    },
    data: {
      billingStatus: PhoneNumberBillingStatus.RELEASE_PENDING,
      billingSuspendedAt: args.number.billingSuspendedAt ?? args.now,
      scheduledReleaseAt: args.scheduledReleaseAt,
      billingFailureCount: { increment: 1 },
      lastBillingAttemptAt: args.now,
      billingSuspendedAgentId:
        args.number.billingSuspendedAgentId ?? args.number.agentId,
      billingOperationToken: null,
      billingOperationExpiresAt: null,
      billingReleaseClaimedAt: null,
    },
  });
  return result.count > 0;
}

async function recordRenewalFailure(args: {
  phId: string;
  organizationId: string;
  token: string;
  now: Date;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: { in: RENEWAL_STATUSES },
      billingOperationToken: args.token,
    },
    data: {
      lastBillingAttemptAt: args.now,
      billingFailureCount: { increment: 1 },
      billingOperationToken: null,
      billingOperationExpiresAt: null,
    },
  });
  return result.count > 0;
}

async function revertReleaseClaim(args: {
  phId: string;
  organizationId: string;
  token: string;
  now: Date;
}) {
  const result = await prisma.phoneNumber.updateMany({
    where: {
      phId: args.phId,
      organizationId: args.organizationId,
      billingStatus: RELEASING_PHONE_STATUS,
      billingOperationToken: args.token,
    },
    data: {
      billingStatus: PhoneNumberBillingStatus.RELEASE_PENDING,
      billingFailureCount: { increment: 1 },
      lastBillingAttemptAt: args.now,
      billingOperationToken: null,
      billingOperationExpiresAt: null,
      billingReleaseClaimedAt: null,
    },
  });
  return result.count > 0;
}

export const numberBillingOperationStore: NumberBillingOperationStore = {
  listReleaseCandidates,
  claimRenewal,
  claimRelease,
  authorizeRelease,
  refreshOperation,
  completeRenewal,
  suspendClaimed,
  recordRenewalFailure,
  revertReleaseClaim,
};
