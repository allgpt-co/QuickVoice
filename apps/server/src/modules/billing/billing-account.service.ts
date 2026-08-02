import prisma from "../../config/prisma.js";
import { billingMode, isHostedBilling } from "../../config/billing-mode.js";
import { stripeClient } from "../../config/stripe.js";
import { maybeGrantSignupCredit } from "./signup-credit.service.js";

export async function getWalletSummary(
  organizationId: string,
  userId: string,
) {
  // Auth/organization hooks normally create the grant immediately. Re-run the
  // idempotent grant check on the first billing read so a transient hook or
  // process interruption cannot permanently strand an eligible signup.
  if (isHostedBilling) {
    await maybeGrantSignupCredit({ userId, organizationId });
  }
  const account = await prisma.billingAccount.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
  const [membership, subscription] = await Promise.all([
    prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    }),
    prisma.subscription.findFirst({
      where: {
        referenceId: organizationId,
        status: { in: ["active", "trialing"] },
      },
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
      select: {
        plan: true,
        status: true,
        periodEnd: true,
        cancelAtPeriodEnd: true,
      },
    }),
  ]);
  // A reservation moves money out of the spendable balance and into the
  // reserved columns atomically. Subtracting it again here would make every
  // active reservation appear twice and can incorrectly block calls/reloads.
  const paidAvailableMicros = account.paidBalanceMicros;
  const promotionalAvailableMicros = account.promotionalBalanceMicros;
  const availableBalanceMicros = nonNegative(
    paidAvailableMicros + promotionalAvailableMicros - account.debtMicros,
  );

  return {
    billingMode,
    currency: account.currency.toLowerCase(),
    paidBalanceMicros: account.paidBalanceMicros,
    promotionalBalanceMicros: account.promotionalBalanceMicros,
    paidAvailableMicros,
    promotionalAvailableMicros,
    reservedPaidMicros: account.reservedPaidMicros,
    reservedPromotionalMicros: account.reservedPromotionalMicros,
    debtMicros: account.debtMicros,
    availableBalanceMicros,
    canManage: membership?.role === "owner" || membership?.role === "admin",
    canManageBilling:
      membership?.role === "owner" || membership?.role === "admin",
    paymentMethod: await paymentMethodSummary(account.stripePaymentMethodId),
    autoRecharge: {
      enabled: account.autoRechargeEnabled,
      thresholdMicros: account.autoRechargeThresholdMicros,
      amountMicros: account.autoRechargeAmountMicros,
    },
    legacySubscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          endsAt: subscription.periodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
  };
}

export async function getWalletTransactions(args: {
  organizationId: string;
  limit: number;
  cursor?: string;
}) {
  const rows = await prisma.billingTransaction.findMany({
    where: { organizationId: args.organizationId },
    orderBy: [{ createdAt: "desc" }, { billingTransactionId: "desc" }],
    take: args.limit + 1,
    ...(args.cursor
      ? { cursor: { billingTransactionId: args.cursor }, skip: 1 }
      : {}),
  });
  const hasMore = rows.length > args.limit;
  const items = hasMore ? rows.slice(0, args.limit) : rows;
  return {
    items,
    nextCursor: hasMore
      ? (items.at(-1)?.billingTransactionId ?? null)
      : null,
  };
}

async function paymentMethodSummary(paymentMethodId: string | null) {
  if (!paymentMethodId) return null;
  if (!isHostedBilling) return { id: paymentMethodId };
  try {
    const paymentMethod = await stripeClient.paymentMethods.retrieve(
      paymentMethodId,
    );
    return {
      id: paymentMethod.id,
      type: paymentMethod.type,
      brand: paymentMethod.card?.brand ?? null,
      last4: paymentMethod.card?.last4 ?? null,
      expMonth: paymentMethod.card?.exp_month ?? null,
      expYear: paymentMethod.card?.exp_year ?? null,
    };
  } catch (error) {
    console.warn("[billing] failed to retrieve saved Stripe payment method", {
      paymentMethodId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { id: paymentMethodId };
  }
}

function nonNegative(value: bigint) {
  return value > 0n ? value : 0n;
}
