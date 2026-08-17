import prisma from "../../config/prisma.js";
import { stripeClient } from "../../config/stripe.js";
import { isHostedBilling } from "../../config/billing-mode.js";

/**
 * Makes every paid legacy plan end at its already-paid period boundary. This
 * is intentionally retryable; Stripe and the local update are both idempotent.
 */
export async function scheduleLegacySubscriptionsForPrepaidTransition() {
  if (!isHostedBilling) return { skipped: true, transitioned: 0, failed: 0 };

  const subscriptions = await prisma.subscription.findMany({
    where: {
      plan: { notIn: ["free", "payg"] },
      status: {
        in: [
          "active",
          "trialing",
          "paused",
          "past_due",
          "unpaid",
          "incomplete",
        ],
      },
      stripeSubscriptionId: { not: null },
      OR: [
        { status: { in: ["past_due", "unpaid", "incomplete"] } },
        { cancelAtPeriodEnd: false },
        { cancelAtPeriodEnd: null },
      ],
    },
    select: {
      id: true,
      stripeSubscriptionId: true,
      status: true,
      periodEnd: true,
    },
    take: 200,
  });
  let transitioned = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      const now = new Date();
      const action = legacyTransitionAction(
        subscription.status,
        subscription.periodEnd,
        now,
      );
      if (action === "period_end") {
        await stripeClient.subscriptions.update(
          subscription.stripeSubscriptionId!,
          { cancel_at_period_end: true },
          { idempotencyKey: `prepaid-transition:${subscription.id}` },
        );
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: true },
        });
      } else {
        // Dunning subscriptions have no paid future entitlement. Cancel them
        // now so Stripe cannot collect a legacy invoice after wallet metering
        // starts.
        await stripeClient.subscriptions.cancel(
          subscription.stripeSubscriptionId!,
          {},
          { idempotencyKey: `prepaid-transition-cancel:${subscription.id}` },
        );
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "canceled",
            cancelAtPeriodEnd: false,
            canceledAt: now,
            endedAt: now,
          },
        });
      }
      transitioned += 1;
    } catch (error) {
      failed += 1;
      console.error("[billing] failed to schedule legacy plan cancellation", {
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { skipped: false, transitioned, failed };
}

export function legacyTransitionAction(
  status: string | null,
  periodEnd: Date | null,
  now: Date,
): "period_end" | "immediate" {
  const normalized = status?.toLowerCase();
  return (normalized === "active" ||
    normalized === "trialing" ||
    normalized === "paused") &&
    (!periodEnd || periodEnd > now)
    ? "period_end"
    : "immediate";
}
