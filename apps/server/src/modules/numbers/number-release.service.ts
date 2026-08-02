import { randomUUID } from "node:crypto";

import type { PhoneNumber } from "../../../prisma/generated/prisma/client.js";
import {
  numberBillingOperationStore,
  type NumberBillingOperationStore,
} from "./number-billing-operation.repository.js";

export const NUMBER_BILLING_OPERATION_LEASE_MS = 5 * 60 * 1_000;

export type LastChanceRenewalResult =
  | { status: "renewed" }
  | { status: "unfunded" }
  | { status: "retry" }
  | { status: "claim_lost" };

export type NumberReleaseServiceDeps = {
  store?: NumberBillingOperationStore;
  tryLastChanceRenewal: (
    number: PhoneNumber,
    now: Date,
    operationToken: string,
  ) => Promise<LastChanceRenewalResult>;
  deleteClaimedNumber: (
    organizationId: string,
    phId: string,
    operationToken: string,
    now: Date,
  ) => Promise<boolean>;
  randomId?: () => string;
  onError?: (error: unknown, number: PhoneNumber) => void;
};

/**
 * Claims an expired rental before making any external release call. Renewal
 * and release share the same operation token, so a stale list read cannot
 * delete a row that Stripe-funded renewal moved back to ACTIVE.
 */
export class NumberReleaseService {
  private readonly store: NumberBillingOperationStore;
  private readonly tryLastChanceRenewal: NumberReleaseServiceDeps["tryLastChanceRenewal"];
  private readonly deleteClaimedNumber: NumberReleaseServiceDeps["deleteClaimedNumber"];
  private readonly randomId: () => string;
  private readonly onError: NonNullable<NumberReleaseServiceDeps["onError"]>;

  constructor(deps: NumberReleaseServiceDeps) {
    this.store = deps.store ?? numberBillingOperationStore;
    this.tryLastChanceRenewal = deps.tryLastChanceRenewal;
    this.deleteClaimedNumber = deps.deleteClaimedNumber;
    this.randomId = deps.randomId ?? randomUUID;
    this.onError = deps.onError ?? (() => undefined);
  }

  async releaseExpiredSuspensions(now: Date): Promise<string[]> {
    const candidates = await this.store.listReleaseCandidates(now);
    const released: string[] = [];

    for (const candidate of candidates) {
      const operationToken = this.randomId();
      try {
        const claimed = await this.store.claimRelease({
          phId: candidate.phId,
          organizationId: candidate.organizationId,
          token: operationToken,
          now,
          leaseUntil: new Date(
            now.getTime() + NUMBER_BILLING_OPERATION_LEASE_MS,
          ),
        });
        if (!claimed) continue;

        // A non-null timestamp is the durable point-of-no-return: an earlier
        // worker completed the last-chance balance check and may already have
        // deleted the provider resource. Retries resume release and must not
        // resurrect that number if funds arrive later.
        if (claimed.billingReleaseClaimedAt === null) {
          const renewal = await this.tryLastChanceRenewal(
            claimed,
            now,
            operationToken,
          );
          if (renewal.status !== "unfunded") continue;

          const authorized = await this.store.authorizeRelease({
            phId: claimed.phId,
            organizationId: claimed.organizationId,
            token: operationToken,
            now,
            leaseUntil: new Date(
              now.getTime() + NUMBER_BILLING_OPERATION_LEASE_MS,
            ),
          });
          if (!authorized) continue;
        }

        const deleted = await this.deleteClaimedNumber(
          claimed.organizationId,
          claimed.phId,
          operationToken,
          now,
        );
        if (deleted) released.push(claimed.phId);
      } catch (error) {
        this.onError(error, candidate);
      }
    }

    return released;
  }
}
