import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_TIMEOUT_MS,
  pollForBillingUpdate,
} from "../src/lib/billing/polling.ts";
import { getTransactionPresentation } from "../src/lib/billing/transaction-presentation.ts";

const CONSOLE_ROOT = new URL("..", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(CONSOLE_ROOT, path), "utf8");
}

test("billing client uses prepaid wallet endpoints and Stripe client secrets", () => {
  const api = read("src/lib/api/resources/billing.ts");
  const stripe = read("src/components/billing/StripeBillingDialogs.tsx");

  assert.match(api, /\/billing\/summary/);
  assert.match(api, /\/billing\/transactions/);
  assert.match(api, /\/billing\/top-ups\/checkout/);
  assert.match(api, /\/billing\/payment-method\/setup/);
  assert.match(api, /\/billing\/auto-recharge/);
  assert.match(api, /"Idempotency-Key": idempotencyKey/);
  assert.match(api, /topUpId: string/);
  assert.match(api, /referenceId\?: string \| null/);
  assert.match(stripe, /EmbeddedCheckoutProvider/);
  assert.match(stripe, /confirmSetup/);
  assert.match(stripe, /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
});

test("wallet checkout reuses a browser UUID and polls for the matching ledger credit", () => {
  const billing = read("src/app/(app)/settings/billing/page.tsx");

  assert.match(billing, /globalThis\.crypto\.randomUUID\(\)/);
  assert.match(billing, /topUpAttempt\?\.amountCents === amountCents/);
  assert.match(billing, /transaction\.referenceId === topUpId/);
  assert.match(billing, /setTopUpAttempt\(null\)/);
  assert.match(billing, /Payment is processing/);
  assert.match(billing, /Confirmation is taking longer than expected/);
  assert.equal(BILLING_POLL_INTERVAL_MS, 2_000);
  assert.equal(BILLING_POLL_TIMEOUT_MS, 30_000);
});

test("billing confirmation polling retries, matches, and supports cancellation", async () => {
  let attempts = 0;
  const matched = await pollForBillingUpdate({
    intervalMs: 1,
    timeoutMs: 100,
    check: () => {
      attempts += 1;
      return attempts === 3;
    },
  });
  assert.equal(matched, "matched");
  assert.equal(attempts, 3);

  const controller = new AbortController();
  const aborted = await pollForBillingUpdate({
    intervalMs: 1,
    timeoutMs: 100,
    signal: controller.signal,
    check: () => {
      controller.abort();
      return false;
    },
  });
  assert.equal(aborted, "aborted");
});

test("saved payment method setup waits for the Stripe-backed summary", () => {
  const billing = read("src/app/(app)/settings/billing/page.tsx");
  const stripe = read("src/components/billing/StripeBillingDialogs.tsx");

  assert.match(stripe, /result\.setupIntent\?\.payment_method/);
  assert.match(stripe, /try\s*\{[\s\S]*stripe\.confirmSetup/);
  assert.match(stripe, /catch \(error\)/);
  assert.match(stripe, /finally\s*\{\s*setSubmitting\(false\)/);
  assert.match(billing, /latestPaymentMethodId === expectedPaymentMethodId/);
  assert.match(billing, /Saving payment method/);
  assert.match(billing, /Payment method confirmation timed out/);
});

test("billing state and query caches are scoped to the active organization", () => {
  const billing = read("src/app/(app)/settings/billing/page.tsx");
  const hooks = read("src/hooks/queries/billing.ts");
  const keys = read("src/lib/query-keys.ts");

  assert.match(billing, /key=\{organizationId \?\? "no-organization"\}/);
  assert.match(billing, /isActiveRef\.current = false/);
  assert.match(billing, /if \(!isActiveRef\.current\) return/);
  assert.match(hooks, /queryKeys\.billing\.summary\(organizationId\)/);
  assert.match(hooks, /queryKeys\.billing\.transactions\(organizationId\)/);
  assert.match(keys, /summary: \(organizationId: string \| null\)/);
});

test("console auth no longer exposes the legacy Better Auth Stripe client", () => {
  const authClient = read("src/lib/auth-client.ts");
  const packageManifest = read("package.json");

  assert.doesNotMatch(authClient, /stripeClient|@better-auth\/stripe/);
  assert.doesNotMatch(packageManifest, /@better-auth\/stripe/);
});

test("wallet UI keeps promotional credit separate from paid number credit", () => {
  const billing = read("src/app/(app)/settings/billing/page.tsx");

  assert.match(billing, /Paid credit/);
  assert.match(billing, /Promotional credit/);
  assert.match(billing, /cannot buy or renew phone numbers/);
  assert.match(billing, /\$5 increments between \$5 and \$500/);
  assert.match(billing, /Organization owners and admins/);
  assert.doesNotMatch(billing, /Available plans|Choose plan|Current plan/);
});

test("transaction history distinguishes temporary holds, releases, and final settlements", () => {
  const base = {
    createdAt: "2026-08-01T00:00:00.000Z",
    grossAmountMicros: 2_000_000,
  };
  const purchaseHold = getTransactionPresentation({
    ...base,
    type: "NUMBER_PURCHASE",
    paidBalanceDeltaMicros: -2_000_000,
    reservedPaidDeltaMicros: 2_000_000,
  });
  const purchaseSettlement = getTransactionPresentation({
    ...base,
    type: "NUMBER_PURCHASE",
    reservedPaidDeltaMicros: -2_000_000,
  });
  const releasedHold = getTransactionPresentation({
    ...base,
    type: "RESERVATION_RELEASE",
    description: "Phone number purchase hold released",
    paidBalanceDeltaMicros: 2_000_000,
    reservedPaidDeltaMicros: -2_000_000,
  });
  const callHold = getTransactionPresentation({
    ...base,
    type: "CALL_RESERVATION",
    reservedPromotionalDeltaMicros: 2_000_000,
  });
  const callSettlement = getTransactionPresentation({
    ...base,
    type: "CALL_SETTLEMENT",
    reservedPromotionalDeltaMicros: -2_000_000,
  });

  assert.equal(purchaseHold.tone, "hold");
  assert.equal(purchaseHold.statusLabel, "Temporary hold");
  assert.equal(purchaseHold.amountPrefix, "Held ");
  assert.match(purchaseHold.detail, /not a final charge/);

  assert.equal(purchaseSettlement.tone, "debit");
  assert.equal(purchaseSettlement.statusLabel, "Settled");
  assert.equal(purchaseSettlement.amountPrefix, "−");

  assert.equal(releasedHold.tone, "release");
  assert.equal(releasedHold.statusLabel, "Released");
  assert.equal(releasedHold.amountPrefix, "Released ");
  assert.match(releasedHold.detail, /not new credit/);

  assert.equal(callHold.label, "Call credit hold");
  assert.equal(callHold.tone, "hold");
  assert.equal(callSettlement.label, "Call usage settled");
  assert.equal(callSettlement.tone, "debit");
});

test("number purchase sends quotes and exposes 30-day paid-credit pricing", () => {
  const types = read("src/lib/api/types.ts");
  const numberApi = read("src/lib/api/resources/numbers.ts");
  const drawer = read("src/components/numbers/BuyNumberDrawer.tsx");

  assert.match(types, /rentalPriceMicros/);
  assert.match(types, /billingStatus: PhoneNumberBillingStatus/);
  assert.match(types, /nextBillingAt/);
  assert.match(types, /scheduledReleaseAt/);
  assert.match(types, /quoteId/);
  assert.match(numberApi, /quoteId: string/);
  assert.match(drawer, /quoteId: number\.quoteId/);
  assert.match(drawer, /\$2 per 30 days/);
  assert.match(drawer, /Promotional credit cannot\s+buy or renew numbers/);

  const numberPage = read("src/app/(app)/numbers/page.tsx");
  assert.match(numberPage, /Release pending/);
  assert.match(numberPage, /Scheduled for release/);
  assert.match(numberPage, /may be permanently lost/);
  assert.match(numberPage, /Renews/);
});

test("agent model estimate renders only from a server-provided field", () => {
  const types = read("src/lib/api/types.ts");
  const voiceTab = read("src/components/agents/tabs/VoiceTab.tsx");

  assert.match(types, /estimatedPricePerMinuteMicros/);
  assert.match(voiceTab, /config\?\.estimatedPricePerMinuteMicros/);
  assert.match(voiceTab, /Estimated AI \+ platform spend/);
  assert.match(
    voiceTab,
    /estimate includes configured STT, TTS, and LLM usage plus the \$0\.01-per-connected-minute QuickVoice platform fee/,
  );
  assert.match(voiceTab, /Telephony is charged separately/);
});
