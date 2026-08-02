import assert from "node:assert/strict";
import test from "node:test";

import {
  PhoneNumberBillingStatus,
  TelephonyProvider,
  type PhoneNumber,
} from "../../prisma/generated/prisma/client.js";
import {
  createNumberDeleter,
  PhoneNumberReleaseClaimLostError,
  type NumberDeletionDeps,
} from "../../src/modules/numbers/number-deletion.service.js";

const NOW = new Date("2026-08-01T12:00:00.000Z");

function claimedPhone(overrides: Record<string, unknown> = {}): PhoneNumber {
  return {
    phId: "phone-1",
    number: "+14155550100",
    organizationId: "org-1",
    userId: "user-1",
    agentId: null,
    sid: "provider-phone-1",
    friendlyName: "+1 415-555-0100",
    provider: TelephonyProvider.TWILIO,
    billingStatus: "RELEASING" as PhoneNumberBillingStatus,
    providerMonthlyCostMicros: 1_000_000n,
    rentalPriceMicros: 2_000_000n,
    nextBillingAt: NOW,
    lastBilledAt: new Date("2026-07-01T12:00:00.000Z"),
    billingSuspendedAt: new Date("2026-07-29T12:00:00.000Z"),
    scheduledReleaseAt: NOW,
    billingOperationToken: "release-token",
    billingOperationExpiresAt: new Date("2026-08-01T12:05:00.000Z"),
    billingReleaseClaimedAt: NOW,
    billingFailureCount: 1,
    lastBillingAttemptAt: NOW,
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

function deps(overrides: Partial<NumberDeletionDeps> = {}): NumberDeletionDeps {
  return {
    clock: () => NOW,
    getByIdForOrg: async () => null,
    refreshClaimedNumberForRelease: async () => null,
    setProviderBinding: async () => undefined,
    setLiveKitBinding: async () => undefined,
    removeTwilioNumber: async () => undefined,
    deleteTelnyxNumber: async () => undefined,
    deletePhoneNumber: async () => false,
    deleteClaimedPhoneNumber: async () => false,
    ...overrides,
  };
}

test("provider deletion is blocked when the release token changes during detach", async () => {
  const phone = claimedPhone({ agentId: "agent-1" });
  let refreshCalls = 0;
  let providerDeleteCalls = 0;
  let databaseDeleteCalls = 0;
  const release = createNumberDeleter(
    deps({
      refreshClaimedNumberForRelease: async () => {
        refreshCalls += 1;
        return refreshCalls === 1 ? phone : null;
      },
      removeTwilioNumber: async () => {
        providerDeleteCalls += 1;
      },
      deleteClaimedPhoneNumber: async () => {
        databaseDeleteCalls += 1;
        return true;
      },
    }),
  );

  await assert.rejects(
    release("org-1", "phone-1", {
      releaseClaim: { operationToken: "release-token", now: NOW },
    }),
    PhoneNumberReleaseClaimLostError,
  );
  assert.equal(refreshCalls, 2);
  assert.equal(providerDeleteCalls, 0);
  assert.equal(databaseDeleteCalls, 0);
});

test("provider 404 is an idempotent release and local claimed cleanup continues", async () => {
  const phone = claimedPhone();
  let providerDeleteCalls = 0;
  let databaseDeleteCalls = 0;
  const release = createNumberDeleter(
    deps({
      refreshClaimedNumberForRelease: async () => phone,
      removeTwilioNumber: async () => {
        providerDeleteCalls += 1;
        throw { status: 404 };
      },
      deleteClaimedPhoneNumber: async ({ operationToken }) => {
        databaseDeleteCalls += 1;
        assert.equal(operationToken, "release-token");
        return true;
      },
    }),
  );

  assert.equal(
    await release("org-1", "phone-1", {
      releaseClaim: { operationToken: "release-token", now: NOW },
    }),
    true,
  );
  assert.equal(providerDeleteCalls, 1);
  assert.equal(databaseDeleteCalls, 1);
});

test("each claim verification extends its lease from the current clock", async () => {
  const phone = claimedPhone({ agentId: "agent-1" });
  const clockValues = [NOW, new Date("2026-08-01T12:01:00.000Z")];
  const leaseDeadlines: Date[] = [];
  const release = createNumberDeleter(
    deps({
      clock: () => clockValues.shift() ?? NOW,
      refreshClaimedNumberForRelease: async ({ leaseUntil }) => {
        leaseDeadlines.push(leaseUntil);
        return phone;
      },
      deleteClaimedPhoneNumber: async () => true,
    }),
  );

  await release("org-1", "phone-1", {
    releaseClaim: { operationToken: "release-token", now: NOW },
  });

  assert.deepEqual(
    leaseDeadlines.map((deadline) => deadline.toISOString()),
    ["2026-08-01T12:05:00.000Z", "2026-08-01T12:06:00.000Z"],
  );
});
