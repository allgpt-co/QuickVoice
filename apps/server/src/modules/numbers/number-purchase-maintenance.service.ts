import { PhoneNumberPurchaseStatus } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import {
  numberPurchaseService,
  type NumberPurchaseResumeResult,
} from "./number-purchase.service.js";
import { safeErrorMessage } from "./provider-error.js";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;

const RECOVERABLE_STATUSES = [
  PhoneNumberPurchaseStatus.PENDING,
  PhoneNumberPurchaseStatus.RESERVED,
  PhoneNumberPurchaseStatus.PROVIDER_PENDING,
  PhoneNumberPurchaseStatus.PROVIDER_PURCHASED,
  PhoneNumberPurchaseStatus.NUMBER_PERSISTED,
];

type RecoveryCandidate = { phoneNumberPurchaseId: string };

export type NumberPurchaseRecoveryServiceDeps = {
  hosted?: boolean;
  now?: () => Date;
  findClaimable?: (args: {
    now: Date;
    take: number;
  }) => Promise<RecoveryCandidate[]>;
  resumePurchase?: (
    phoneNumberPurchaseId: string,
  ) => Promise<NumberPurchaseResumeResult>;
  reportError?: (phoneNumberPurchaseId: string, error: unknown) => void;
};

export class NumberPurchaseRecoveryService {
  private readonly hosted: boolean;
  private readonly now: () => Date;
  private readonly findClaimable: NonNullable<
    NumberPurchaseRecoveryServiceDeps["findClaimable"]
  >;
  private readonly resumePurchase: NonNullable<
    NumberPurchaseRecoveryServiceDeps["resumePurchase"]
  >;
  private readonly reportError: NonNullable<
    NumberPurchaseRecoveryServiceDeps["reportError"]
  >;

  constructor(deps: NumberPurchaseRecoveryServiceDeps = {}) {
    this.hosted = deps.hosted ?? isHostedBilling;
    this.now = deps.now ?? (() => new Date());
    this.findClaimable = deps.findClaimable ?? findClaimablePurchases;
    this.resumePurchase =
      deps.resumePurchase ??
      ((phoneNumberPurchaseId) =>
        numberPurchaseService.resumePurchase(phoneNumberPurchaseId));
    this.reportError =
      deps.reportError ??
      ((phoneNumberPurchaseId, error) => {
        console.error("[billing] failed to recover phone number purchase", {
          phoneNumberPurchaseId,
          error: safeErrorMessage(error),
        });
      });
  }

  async run(requestedBatchSize = DEFAULT_BATCH_SIZE) {
    if (!this.hosted) {
      return {
        skipped: true,
        examined: 0,
        recovered: 0,
        contended: 0,
        errors: 0,
      };
    }

    const take = Math.max(
      1,
      Math.min(MAX_BATCH_SIZE, Math.trunc(requestedBatchSize)),
    );
    const candidates = (
      await this.findClaimable({ now: this.now(), take })
    ).slice(0, take);
    let recovered = 0;
    let contended = 0;
    let errors = 0;

    for (const candidate of candidates) {
      try {
        const result = await this.resumePurchase(
          candidate.phoneNumberPurchaseId,
        );
        if (result.claimed) recovered += 1;
        else contended += 1;
      } catch (error) {
        // Each saga owns its retry state. Most operational failures release
        // the processing token; an abrupt worker/database failure is retried
        // once its bounded processing lease expires.
        errors += 1;
        this.reportError(candidate.phoneNumberPurchaseId, error);
      }
    }

    return {
      skipped: false,
      examined: candidates.length,
      recovered,
      contended,
      errors,
    };
  }
}

async function findClaimablePurchases(args: { now: Date; take: number }) {
  return prisma.phoneNumberPurchase.findMany({
    where: {
      status: { in: RECOVERABLE_STATUSES },
      OR: [
        { processingToken: null },
        { processingExpiresAt: null },
        { processingExpiresAt: { lte: args.now } },
      ],
    },
    orderBy: [{ updatedAt: "asc" }, { phoneNumberPurchaseId: "asc" }],
    take: args.take,
    select: { phoneNumberPurchaseId: true },
  });
}

export const numberPurchaseRecoveryService =
  new NumberPurchaseRecoveryService();

export function recoverStaleNumberPurchases() {
  return numberPurchaseRecoveryService.run();
}
