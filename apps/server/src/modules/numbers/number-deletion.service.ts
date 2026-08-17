import {
  TelephonyProvider,
  type PhoneNumber,
} from "../../../prisma/generated/prisma/client.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { isProviderNotFoundError } from "./provider-error.js";

const PROVIDER_RELEASE_LEASE_MS = 5 * 60 * 1_000;

export class PhoneNumberReleaseClaimLostError extends Error {
  constructor() {
    super("Phone number release claim is no longer current");
    this.name = "PhoneNumberReleaseClaimLostError";
  }
}

export type DeleteNumberOptions = {
  releaseClaim?: {
    operationToken: string;
    now: Date;
  };
};

export type NumberDeletionDeps = {
  clock?: () => Date;
  getByIdForOrg: (
    phId: string,
    organizationId: string,
  ) => Promise<PhoneNumber | null>;
  refreshClaimedNumberForRelease: (args: {
    phId: string;
    organizationId: string;
    operationToken: string;
    leaseUntil: Date;
  }) => Promise<PhoneNumber | null>;
  setProviderBinding: (attach: boolean, number: PhoneNumber) => Promise<void>;
  setLiveKitBinding: (attach: boolean, number: PhoneNumber) => Promise<void>;
  removeTwilioNumber: (sid: string) => Promise<unknown>;
  deleteTelnyxNumber: (sid: string) => Promise<unknown>;
  deletePhoneNumber: (phId: string, organizationId: string) => Promise<boolean>;
  deleteClaimedPhoneNumber: (args: {
    phId: string;
    organizationId: string;
    operationToken: string;
  }) => Promise<boolean>;
};

export function createNumberDeleter(deps: NumberDeletionDeps) {
  return async (
    organizationId: string,
    phId: string,
    options: DeleteNumberOptions = {},
  ) => {
    const refreshReleaseClaim = () => {
      const claim = options.releaseClaim;
      if (!claim) return deps.getByIdForOrg(phId, organizationId);
      const refreshStartedAt = deps.clock?.() ?? new Date();
      return deps.refreshClaimedNumberForRelease({
        phId,
        organizationId,
        operationToken: claim.operationToken,
        leaseUntil: new Date(
          Math.max(claim.now.getTime(), refreshStartedAt.getTime()) +
            PROVIDER_RELEASE_LEASE_MS,
        ),
      });
    };

    let existing = await refreshReleaseClaim();
    if (!existing && options.releaseClaim) {
      throw new PhoneNumberReleaseClaimLostError();
    }
    if (!existing) {
      throw new NotFoundError("Phone number not found");
    }

    if (existing.agentId !== null) {
      try {
        await deps.setProviderBinding(false, existing);
      } catch (error) {
        if (!isProviderNotFoundError(error)) throw error;
      }
      await deps.setLiveKitBinding(false, existing);
    }

    // Detaching can involve multiple network calls. Refresh and verify the CAS
    // token again immediately before the irreversible provider deletion.
    if (options.releaseClaim) {
      existing = await refreshReleaseClaim();
      if (!existing) throw new PhoneNumberReleaseClaimLostError();
    }

    try {
      if (existing.provider === TelephonyProvider.TWILIO) {
        await deps.removeTwilioNumber(existing.sid);
      } else {
        await deps.deleteTelnyxNumber(existing.sid);
      }
    } catch (error) {
      // A previous attempt may have released the provider resource and crashed
      // before deleting the local row. Provider 404 therefore means this step
      // is already complete and the local cleanup should continue.
      if (!isProviderNotFoundError(error)) throw error;
    }

    const deleted = options.releaseClaim
      ? await deps.deleteClaimedPhoneNumber({
          phId,
          organizationId,
          operationToken: options.releaseClaim.operationToken,
        })
      : await deps.deletePhoneNumber(phId, organizationId);
    if (!deleted) {
      if (options.releaseClaim) {
        throw new PhoneNumberReleaseClaimLostError();
      }
      throw new NotFoundError("Phone number not found");
    }
    return true;
  };
}
