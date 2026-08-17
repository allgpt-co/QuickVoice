import assert from "node:assert/strict";
import { test } from "node:test";

import {
  autoRechargeFundsDecision,
  financialPrincipalTargets,
  manualTopUpIdempotencyKey,
  manualTopUpStripeIdempotencyKey,
  mergeDisputeState,
  organizationStripeCustomerResolution,
  runClaimedWebhookAttempt,
  stripeDisputeState,
  unappliedFinancialDelta,
} from "../../src/modules/billing/stripe-wallet-state.js";

test("usage-only promo cannot suppress a paid-only number reload", () => {
  assert.equal(
    autoRechargeFundsDecision({
      paidBalanceMicros: 0n,
      promotionalBalanceMicros: 5_000_000n,
      debtMicros: 0n,
      thresholdMicros: 500_000n,
      requiredPaidMicros: 2_000_000n,
    }),
    "recharge",
  );
});

test("manual top-up keys cannot enter automatic or system namespaces", () => {
  assert.throws(() => manualTopUpIdempotencyKey("auto:renewal"), /reserved/i);
  assert.throws(() => manualTopUpIdempotencyKey("SYSTEM:job"), /reserved/i);
  assert.equal(
    manualTopUpIdempotencyKey("client-request-1"),
    "client-request-1",
  );
  assert.match(manualTopUpIdempotencyKey(), /^manual:/);
});

test("manual top-up keys enforce Stripe's nonempty 255-character limit", () => {
  assert.throws(() => manualTopUpIdempotencyKey(""), /must not be empty/i);
  assert.throws(() => manualTopUpIdempotencyKey("   "), /must not be empty/i);
  assert.equal(manualTopUpIdempotencyKey(" x "), "x");
  assert.equal(manualTopUpIdempotencyKey("x".repeat(255)), "x".repeat(255));
  assert.throws(
    () => manualTopUpIdempotencyKey("x".repeat(256)),
    /255 characters/i,
  );
});

test("provider top-up keys deterministically hash the full accepted client key", () => {
  const clientKey = manualTopUpIdempotencyKey("x".repeat(255));
  const providerKey = manualTopUpStripeIdempotencyKey(
    "billing-account-1",
    clientKey,
  );

  assert.equal(providerKey.length, 73);
  assert.ok(providerKey.length <= 255);
  assert.equal(
    providerKey,
    manualTopUpStripeIdempotencyKey("billing-account-1", clientKey),
  );
  assert.notEqual(
    providerKey,
    manualTopUpStripeIdempotencyKey("billing-account-2", clientKey),
  );
  assert.notEqual(
    providerKey,
    manualTopUpStripeIdempotencyKey("billing-account-1", `${clientKey}y`),
  );
});

test("organization Stripe customer resolution keeps only the durable winner", () => {
  assert.deepEqual(
    organizationStripeCustomerResolution({
      createdCustomerId: "cus_created",
      durableCustomerId: "cus_created",
    }),
    { customerId: "cus_created", deleteCreatedCustomer: false },
  );
  assert.deepEqual(
    organizationStripeCustomerResolution({
      createdCustomerId: "cus_duplicate",
      durableCustomerId: "cus_winner",
    }),
    { customerId: "cus_winner", deleteCreatedCustomer: true },
  );
  assert.deepEqual(
    organizationStripeCustomerResolution({
      createdCustomerId: "cus_orphan",
      durableCustomerId: null,
    }),
    { customerId: null, deleteCreatedCustomer: true },
  );
  assert.deepEqual(
    organizationStripeCustomerResolution({
      createdCustomerId: "cus_deleted_org",
      durableCustomerId: undefined,
    }),
    { customerId: null, deleteCreatedCustomer: true },
  );
});

test("every Stripe dispute status maps to a safe durable wallet state", () => {
  assert.deepEqual(
    {
      lost: stripeDisputeState("lost"),
      needs_response: stripeDisputeState("needs_response"),
      prevented: stripeDisputeState("prevented"),
      under_review: stripeDisputeState("under_review"),
      warning_closed: stripeDisputeState("warning_closed"),
      warning_needs_response: stripeDisputeState("warning_needs_response"),
      warning_under_review: stripeDisputeState("warning_under_review"),
      won: stripeDisputeState("won"),
    },
    {
      lost: "LOST",
      needs_response: "OPEN",
      prevented: "WON",
      under_review: "OPEN",
      warning_closed: "WON",
      warning_needs_response: "OPEN",
      warning_under_review: "OPEN",
      won: "WON",
    },
  );
  assert.equal(stripeDisputeState("future_unknown_status"), "OPEN");
  assert.equal(
    financialPrincipalTargets({
      creditedMicros: 1_000_000n,
      taxMicros: 0n,
      refundTargetProviderCents: 0n,
      disputeTargetProviderCents: 100n,
      disputeState: stripeDisputeState("warning_closed"),
    }).disputedMicros,
    0n,
  );
});

test("a stale webhook worker cannot complete or fail a newer claim", async () => {
  let event = {
    status: "PROCESSING",
    attempts: 1,
    lastError: null as string | null,
  };
  const ownedAttempt = 1;

  await assert.rejects(
    runClaimedWebhookAttempt({
      process: async () => {
        // The first worker exceeded its lease and a second worker claimed the
        // same event with a higher monotonic fencing token.
        event = { status: "PROCESSING", attempts: 2, lastError: null };
        return "org_123";
      },
      complete: async () => {
        if (event.status !== "PROCESSING" || event.attempts !== ownedAttempt) {
          return false;
        }
        event.status = "PROCESSED";
        return true;
      },
      fail: async (error) => {
        if (event.status === "PROCESSING" && event.attempts === ownedAttempt) {
          event.status = "FAILED";
          event.lastError = String(error);
        }
      },
    }),
    /claim is no longer current/i,
  );

  assert.deepEqual(event, {
    status: "PROCESSING",
    attempts: 2,
    lastError: null,
  });
});

test("a marker crash cannot double-apply an advancing cumulative refund target", () => {
  const firstTarget = financialPrincipalTargets({
    creditedMicros: 1_000_000n,
    taxMicros: 0n,
    refundTargetProviderCents: 20n,
    disputeTargetProviderCents: 0n,
    disputeState: "NONE",
  }).refundedMicros;
  const firstDelta = unappliedFinancialDelta(firstTarget, 0n);
  assert.equal(firstDelta, 200_000n);

  // The debit ledger insert commits, then updating TopUp.refundedMicros fails.
  // Reconciliation deliberately derives applied=20c from the append-only ledger.
  const appliedFromLedgerAfterCrash = firstDelta;
  const advancedTarget = financialPrincipalTargets({
    creditedMicros: 1_000_000n,
    taxMicros: 0n,
    refundTargetProviderCents: 50n,
    disputeTargetProviderCents: 0n,
    disputeState: "NONE",
  }).refundedMicros;
  const secondDelta = unappliedFinancialDelta(
    advancedTarget,
    appliedFromLedgerAfterCrash,
  );

  assert.equal(secondDelta, 300_000n);
  assert.equal(appliedFromLedgerAfterCrash + secondDelta, 500_000n);
});

test("dispute.won arriving before dispute.created cannot be reopened", () => {
  const closedFirst = mergeDisputeState("NONE", "WON");
  const staleCreated = mergeDisputeState(closedFirst, "OPEN");
  assert.equal(staleCreated, "WON");
  assert.equal(
    financialPrincipalTargets({
      creditedMicros: 1_000_000n,
      taxMicros: 0n,
      refundTargetProviderCents: 0n,
      disputeTargetProviderCents: 100n,
      disputeState: staleCreated,
    }).disputedMicros,
    0n,
  );
});

test("refund-before-fulfillment remains deferred and applies after credit", () => {
  const before = financialPrincipalTargets({
    creditedMicros: 0n,
    taxMicros: 0n,
    refundTargetProviderCents: 50n,
    disputeTargetProviderCents: 0n,
    disputeState: "NONE",
  });
  assert.equal(before.refundedMicros, 0n);

  const after = financialPrincipalTargets({
    creditedMicros: 1_000_000n,
    taxMicros: 0n,
    refundTargetProviderCents: 50n,
    disputeTargetProviderCents: 0n,
    disputeState: "NONE",
  });
  assert.equal(after.refundedMicros, 500_000n);
});
