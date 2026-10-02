import type { InngestFunction } from "inngest";

import { inngest } from "../config/inngest.js";
import { releaseExpiredBillingReservations } from "../modules/billing/billing-maintenance.service.js";
import { scheduleLegacySubscriptionsForPrepaidTransition } from "../modules/billing/legacy-subscription-transition.service.js";
import { terminateSilentCalls } from "../modules/billing/silent-call-watchdog.service.js";
import { reconcileTelephonyCosts } from "../modules/billing/telephony-reconciliation.service.js";
import { reconcilePendingStripeTopUps } from "../modules/billing/stripe-wallet.service.js";
import { runPhoneNumberBilling } from "../modules/numbers/number-billing.service.js";
import { recoverStaleNumberPurchases } from "../modules/numbers/number-purchase-maintenance.service.js";
import { refreshRateBook } from "../modules/billing/database-rate-catalog.service.js";

export const refreshBillingRates: InngestFunction.Any = inngest.createFunction(
  { id: "refresh-billing-rates", retries: 2, concurrency: 1, triggers: { cron: "TZ=UTC 0 2 * * *" } },
  async ({ step }) => step.run("import-validated-rate-book", () => refreshRateBook()),
);

export const expireBillingReservations: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "expire-billing-reservations",
      retries: 2,
      triggers: { cron: "TZ=UTC * * * * *" },
    },
    async ({ step }) =>
      step.run("release-expired-wallet-holds", () =>
        releaseExpiredBillingReservations(),
      ),
  );

export const terminateSilentBilledCalls: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "terminate-silent-billed-calls",
      retries: 2,
      triggers: { cron: "TZ=UTC * * * * *" },
    },
    async ({ step }) =>
      step.run("hang-up-calls-without-usage-reports", () =>
        terminateSilentCalls(),
      ),
  );

export const reconcileProviderCallCosts: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "reconcile-provider-call-costs",
      retries: 2,
      triggers: { cron: "TZ=UTC */5 * * * *" },
    },
    async ({ step }) =>
      step.run("reconcile-twilio-and-telnyx", () => reconcileTelephonyCosts()),
  );

export const billPhoneNumbers: InngestFunction.Any = inngest.createFunction(
  {
    id: "bill-phone-numbers",
    retries: 2,
    triggers: { cron: "TZ=UTC */15 * * * *" },
  },
  async ({ step }) =>
    step.run("renew-suspend-or-release-numbers", () => runPhoneNumberBilling()),
);

export const transitionLegacyBilling: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "transition-legacy-billing-to-prepaid",
      retries: 2,
      triggers: { cron: "TZ=UTC */15 * * * *" },
    },
    async ({ step }) =>
      step.run("cancel-paid-plans-at-period-end", () =>
        scheduleLegacySubscriptionsForPrepaidTransition(),
      ),
  );

export const reconcileStripeWallet: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "reconcile-stripe-wallet",
      retries: 2,
      triggers: { cron: "TZ=UTC * * * * *" },
    },
    async ({ step }) =>
      step.run("reconcile-pending-topups-and-financial-targets", () =>
        reconcilePendingStripeTopUps(),
      ),
  );

export const recoverPhoneNumberPurchases: InngestFunction.Any =
  inngest.createFunction(
    {
      id: "recover-phone-number-purchases",
      retries: 2,
      triggers: { cron: "TZ=UTC * * * * *" },
    },
    async ({ step }) =>
      step.run("resume-abandoned-number-purchases", () =>
        recoverStaleNumberPurchases(),
      ),
  );
