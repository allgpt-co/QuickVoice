import assert from "node:assert/strict";
import test from "node:test";

import {
  PhoneNumberBillingStatus,
  TelephonyProvider,
  type PhoneNumber,
} from "../../prisma/generated/prisma/client.js";
import {
  RELEASING_PHONE_STATUS,
  type NumberBillingOperationStore,
} from "../../src/modules/numbers/number-billing-operation.repository.js";
import { NumberReleaseService } from "../../src/modules/numbers/number-release.service.js";

const NOW = new Date("2026-08-01T12:00:00.000Z");

function phone(overrides: Record<string, unknown> = {}): PhoneNumber {
  return {
    phId: "phone-1",
    number: "+14155550100",
    organizationId: "org-1",
    userId: "user-1",
    agentId: null,
    sid: "provider-phone-1",
    friendlyName: "+1 415-555-0100",
    provider: TelephonyProvider.TWILIO,
    billingStatus: PhoneNumberBillingStatus.RELEASE_PENDING,
    providerMonthlyCostMicros: 1_000_000n,
    rentalPriceMicros: 2_000_000n,
    nextBillingAt: new Date("2026-07-29T12:00:00.000Z"),
    lastBilledAt: new Date("2026-06-29T12:00:00.000Z"),
    billingSuspendedAt: new Date("2026-07-29T12:00:00.000Z"),
    scheduledReleaseAt: NOW,
    billingOperationToken: null,
    billingOperationExpiresAt: null,
    billingReleaseClaimedAt: null,
    billingFailureCount: 1,
    lastBillingAttemptAt: null,
    billingNoticeSentAt: null,
    billingSuspendedAgentId: null,
    billingCountryIso: "US",
    billingNumberType: "local",
    billingRateCatalogVersion: "test",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: NOW,
    ...overrides,
  } as unknown as PhoneNumber;
}

function store(
  overrides: Partial<NumberBillingOperationStore> = {},
): NumberBillingOperationStore {
  return {
    listReleaseCandidates: async () => [],
    claimRenewal: async () => null,
    claimRelease: async () => null,
    authorizeRelease: async () => false,
    refreshOperation: async () => false,
    completeRenewal: async () => false,
    suspendClaimed: async () => false,
    recordRenewalFailure: async () => false,
    revertReleaseClaim: async () => false,
    ...overrides,
  };
}

test("a stale RELEASE_PENDING read cannot delete a concurrently renewed number", async () => {
  const candidate = phone();
  let renewalCalls = 0;
  let deleteCalls = 0;
  const service = new NumberReleaseService({
    store: store({
      listReleaseCandidates: async () => [candidate],
      // Simulates a renewal winning the status/token CAS after this worker's
      // list read but before it tries to claim release.
      claimRelease: async () => null,
    }),
    randomId: () => "release-token",
    tryLastChanceRenewal: async () => {
      renewalCalls += 1;
      return { status: "unfunded" };
    },
    deleteClaimedNumber: async () => {
      deleteCalls += 1;
      return true;
    },
  });

  assert.deepEqual(await service.releaseExpiredSuspensions(NOW), []);
  assert.equal(renewalCalls, 0);
  assert.equal(deleteCalls, 0);
});

test("last-chance funding renews the number without authorizing release", async () => {
  const candidate = phone();
  const claimed = phone({
    billingStatus: RELEASING_PHONE_STATUS,
    billingOperationToken: "release-token",
  });
  let authorizeCalls = 0;
  let deleteCalls = 0;
  const service = new NumberReleaseService({
    store: store({
      listReleaseCandidates: async () => [candidate],
      claimRelease: async () => claimed,
      authorizeRelease: async () => {
        authorizeCalls += 1;
        return true;
      },
    }),
    randomId: () => "release-token",
    tryLastChanceRenewal: async () => ({ status: "renewed" }),
    deleteClaimedNumber: async () => {
      deleteCalls += 1;
      return true;
    },
  });

  assert.deepEqual(await service.releaseExpiredSuspensions(NOW), []);
  assert.equal(authorizeCalls, 0);
  assert.equal(deleteCalls, 0);
});

test("an unfunded number is durably authorized before provider deletion", async () => {
  const candidate = phone();
  const claimed = phone({
    billingStatus: RELEASING_PHONE_STATUS,
    billingOperationToken: "release-token",
  });
  const events: string[] = [];
  const service = new NumberReleaseService({
    store: store({
      listReleaseCandidates: async () => [candidate],
      claimRelease: async () => claimed,
      authorizeRelease: async () => {
        events.push("authorize");
        return true;
      },
    }),
    randomId: () => "release-token",
    tryLastChanceRenewal: async () => {
      events.push("last_chance");
      return { status: "unfunded" };
    },
    deleteClaimedNumber: async () => {
      events.push("delete");
      return true;
    },
  });

  assert.deepEqual(await service.releaseExpiredSuspensions(NOW), ["phone-1"]);
  assert.deepEqual(events, ["last_chance", "authorize", "delete"]);
});

test("a failed release-authorization CAS prevents provider deletion", async () => {
  const claimed = phone({
    billingStatus: RELEASING_PHONE_STATUS,
    billingOperationToken: "release-token",
  });
  let deleteCalls = 0;
  const service = new NumberReleaseService({
    store: store({
      listReleaseCandidates: async () => [phone()],
      claimRelease: async () => claimed,
      authorizeRelease: async () => false,
    }),
    randomId: () => "release-token",
    tryLastChanceRenewal: async () => ({ status: "unfunded" }),
    deleteClaimedNumber: async () => {
      deleteCalls += 1;
      return true;
    },
  });

  assert.deepEqual(await service.releaseExpiredSuspensions(NOW), []);
  assert.equal(deleteCalls, 0);
});

test("an authorized stale RELEASING claim resumes deletion without resurrection", async () => {
  const authorized = phone({
    billingStatus: RELEASING_PHONE_STATUS,
    billingOperationToken: "new-release-token",
    billingOperationExpiresAt: new Date("2026-08-01T11:59:00.000Z"),
    billingReleaseClaimedAt: new Date("2026-08-01T11:50:00.000Z"),
  });
  let renewalCalls = 0;
  let authorizeCalls = 0;
  const service = new NumberReleaseService({
    store: store({
      listReleaseCandidates: async () => [authorized],
      claimRelease: async () => authorized,
      authorizeRelease: async () => {
        authorizeCalls += 1;
        return true;
      },
    }),
    randomId: () => "new-release-token",
    tryLastChanceRenewal: async () => {
      renewalCalls += 1;
      return { status: "renewed" };
    },
    deleteClaimedNumber: async () => true,
  });

  assert.deepEqual(await service.releaseExpiredSuspensions(NOW), ["phone-1"]);
  assert.equal(renewalCalls, 0);
  assert.equal(authorizeCalls, 0);
});
