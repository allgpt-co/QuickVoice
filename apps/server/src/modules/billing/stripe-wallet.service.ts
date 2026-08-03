import { randomUUID } from "node:crypto";
import Stripe from "stripe";

import prisma from "../../config/prisma.js";
import { stripeClient } from "../../config/stripe.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import CustomApiError from "../../common/errors/customApiError.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import type {
  CreateTopUpCheckoutInput,
  UpdateAutoRechargeInput,
} from "./billing.schema.js";
import {
  BillingTransactionType,
  Prisma,
  TopUpKind,
  TopUpTaxMode,
  type TopUp,
} from "../../../prisma/generated/prisma/client.js";
import { MICROS_PER_CENT, assertValidTopUpAmount } from "./money.js";
import {
  autoRechargeFundsDecision,
  financialPrincipalTargets,
  financialTopUpStatus,
  manualTopUpIdempotencyKey,
  manualTopUpStripeIdempotencyKey,
  mergeDisputeState,
  organizationStripeCustomerResolution,
  runClaimedWebhookAttempt,
  stripeDisputeState,
  unappliedFinancialDelta,
  type DurableDisputeState,
} from "./stripe-wallet-state.js";

const TOP_UP_KIND = "quickvoice_top_up";
const AUTO_RECHARGE_KIND = "quickvoice_auto_recharge";
const PAYMENT_METHOD_KIND = "quickvoice_wallet_payment_method";
const AUTOMATIC_PROCESSING_LEASE_MS = 2 * 60 * 1_000;
const FINANCIAL_PROCESSING_LEASE_MS = 2 * 60 * 1_000;
const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1_000;
const RECONCILIATION_RETRY_MS = 60 * 1_000;
const MAX_SERIALIZABLE_ATTEMPTS = 3;

export async function createTopUpCheckout(args: {
  organizationId: string;
  userId: string;
  input: CreateTopUpCheckoutInput;
  idempotencyKey?: string | null;
}) {
  requireHostedPayments();
  const amountMicros = assertValidTopUpAmount(
    BigInt(args.input.amountCents) * MICROS_PER_CENT,
  );
  const account = await ensureBillingAccountRecord(args.organizationId);
  const customerId = await ensureOrganizationStripeCustomer(
    args.organizationId,
  );
  let idempotencyKey: string;
  try {
    idempotencyKey = manualTopUpIdempotencyKey(args.idempotencyKey);
  } catch (error) {
    throw new BadRequestError(
      error instanceof Error ? error.message : "Invalid Idempotency-Key",
    );
  }
  const taxSnapshot = currentTaxSnapshot();
  const topUp = await prisma.topUp.upsert({
    where: {
      billingAccountId_idempotencyKey: {
        billingAccountId: account.billingAccountId,
        idempotencyKey,
      },
    },
    create: {
      billingAccountId: account.billingAccountId,
      organizationId: args.organizationId,
      requestedByUserId: args.userId,
      idempotencyKey,
      kind: TopUpKind.MANUAL,
      taxMode: taxSnapshot.mode,
      stripeTaxCode: taxSnapshot.taxCode,
      amountMicros,
    },
    update: {},
  });
  if (topUp.amountMicros !== amountMicros) {
    throw new CustomApiError(
      "The Idempotency-Key was already used for a different top-up amount",
      409,
      { code: "IDEMPOTENCY_CONFLICT" },
    );
  }
  if (topUp.kind !== TopUpKind.MANUAL) {
    throw new CustomApiError(
      "The Idempotency-Key belongs to an automatic reload",
      409,
      {
        code: "IDEMPOTENCY_CONFLICT",
      },
    );
  }
  if (topUp.creditedMicros > 0n) {
    throw new BadRequestError("This top-up request has already completed");
  }
  if (topUp.stripeCheckoutSessionId) {
    const existing = await stripeClient.checkout.sessions.retrieve(
      topUp.stripeCheckoutSessionId,
    );
    if (existing.client_secret) {
      return { clientSecret: existing.client_secret, topUpId: topUp.topUpId };
    }
  }

  try {
    const session = await stripeClient.checkout.sessions.create(
      {
        ui_mode: "embedded_page",
        mode: "payment",
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "QuickVoice prepaid call credit",
                description:
                  "Prepaid wallet credit. Promotional credit is tracked separately.",
                ...(topUp.taxMode === TopUpTaxMode.STRIPE_TAX
                  ? { tax_code: requiredTopUpTaxCode(topUp) }
                  : {}),
              },
              unit_amount: args.input.amountCents,
            },
            quantity: 1,
          },
        ],
        return_url: `${consoleBaseUrl()}/settings/billing?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
        redirect_on_completion: "if_required",
        automatic_tax: {
          enabled: topUp.taxMode === TopUpTaxMode.STRIPE_TAX,
        },
        customer_update: { address: "auto" },
        payment_intent_data: {
          setup_future_usage: "off_session",
          metadata: stripeMetadata({
            kind: TOP_UP_KIND,
            organizationId: args.organizationId,
            topUpId: topUp.topUpId,
            amountMicros,
          }),
        },
        metadata: stripeMetadata({
          kind: TOP_UP_KIND,
          organizationId: args.organizationId,
          topUpId: topUp.topUpId,
          amountMicros,
        }),
      },
      {
        idempotencyKey: manualTopUpStripeIdempotencyKey(
          account.billingAccountId,
          idempotencyKey,
        ),
      },
    );
    await prisma.topUp.update({
      where: { topUpId: topUp.topUpId },
      data: { stripeCheckoutSessionId: session.id },
    });
    if (!session.client_secret) {
      throw new Error(
        "Stripe did not return an embedded Checkout client secret",
      );
    }
    return { clientSecret: session.client_secret, topUpId: topUp.topUpId };
  } catch (error) {
    await prisma.topUp.update({
      where: { topUpId: topUp.topUpId },
      data: {
        status: "FAILED",
        failureMessage: safeStripeError(error),
      },
    });
    throw error;
  }
}

export async function createPaymentMethodSetup(args: {
  organizationId: string;
}) {
  requireHostedPayments();
  await ensureBillingAccountRecord(args.organizationId);
  const customerId = await ensureOrganizationStripeCustomer(
    args.organizationId,
  );
  const versioned = await prisma.billingAccount.update({
    where: { organizationId: args.organizationId },
    data: { paymentMethodRequestVersion: { increment: 1 } },
    select: { paymentMethodRequestVersion: true },
  });
  const setupIntent = await stripeClient.setupIntents.create(
    {
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: PAYMENT_METHOD_KIND,
        organization_id: args.organizationId,
        payment_method_version: String(versioned.paymentMethodRequestVersion),
      },
    },
    {
      idempotencyKey: `wallet-payment-method:${args.organizationId}:${versioned.paymentMethodRequestVersion}`,
    },
  );
  if (!setupIntent.client_secret) {
    throw new Error("Stripe did not return a SetupIntent client secret");
  }
  return { clientSecret: setupIntent.client_secret };
}

export async function updateAutoRecharge(args: {
  organizationId: string;
  input: UpdateAutoRechargeInput;
}) {
  requireHostedPayments();
  const account = await ensureBillingAccountRecord(args.organizationId);
  if (args.input.enabled && !account.stripePaymentMethodId) {
    throw new BadRequestError(
      "Save a payment method before enabling automatic reload",
    );
  }
  return prisma.billingAccount.update({
    where: { billingAccountId: account.billingAccountId },
    data: {
      autoRechargeEnabled: args.input.enabled,
      autoRechargeThresholdMicros:
        BigInt(args.input.thresholdCents) * MICROS_PER_CENT,
      autoRechargeAmountMicros:
        BigInt(args.input.amountCents) * MICROS_PER_CENT,
    },
  });
}

export async function triggerAutoRecharge(
  organizationId: string,
  reason: "threshold" | "number_renewal" = "threshold",
  options: {
    requiredPaidMicros?: bigint;
    contextKey?: string;
  } = {},
) {
  if (!isHostedBilling) return { triggered: false, reason: "self_hosted" };
  const account = await prisma.billingAccount.findUnique({
    where: { organizationId },
    include: { organization: { select: { stripeCustomerId: true } } },
  });
  if (!account?.autoRechargeEnabled) {
    return { triggered: false, reason: "disabled" };
  }
  if (
    !account.stripePaymentMethodId ||
    !account.organization.stripeCustomerId
  ) {
    return { triggered: false, reason: "payment_method_missing" };
  }
  const fundsDecision = autoRechargeFundsDecision({
    paidBalanceMicros: account.paidBalanceMicros,
    promotionalBalanceMicros: account.promotionalBalanceMicros,
    debtMicros: account.debtMicros,
    thresholdMicros: account.autoRechargeThresholdMicros,
    requiredPaidMicros: options.requiredPaidMicros,
  });
  if (fundsDecision !== "recharge") {
    return { triggered: false, reason: fundsDecision };
  }
  if (options.contextKey) {
    const priorAttempt = await prisma.topUp.findUnique({
      where: {
        billingAccountId_automaticContextKey: {
          billingAccountId: account.billingAccountId,
          automaticContextKey: options.contextKey,
        },
      },
    });
    if (priorAttempt) {
      if (priorAttempt.status === "PENDING") {
        return confirmAutomaticTopUp({
          topUpId: priorAttempt.topUpId,
          customerId: account.organization.stripeCustomerId,
          paymentMethodId: account.stripePaymentMethodId,
          reason,
        });
      }
      return {
        triggered: false,
        reason: "context_already_attempted",
        topUpId: priorAttempt.topUpId,
      };
    }
  }
  const pending = await prisma.topUp.findFirst({
    where: {
      billingAccountId: account.billingAccountId,
      status: "PENDING",
      kind: TopUpKind.AUTOMATIC,
    },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    return confirmAutomaticTopUp({
      topUpId: pending.topUpId,
      customerId: account.organization.stripeCustomerId,
      paymentMethodId: account.stripePaymentMethodId,
      reason,
    });
  }

  const idempotencyKey = `auto:${randomUUID()}`;
  const taxSnapshot = currentTaxSnapshot();
  let topUp: TopUp;
  try {
    topUp = await prisma.topUp.create({
      data: {
        billingAccountId: account.billingAccountId,
        organizationId,
        idempotencyKey,
        kind: TopUpKind.AUTOMATIC,
        automaticContextKey: options.contextKey,
        taxMode: taxSnapshot.mode,
        stripeTaxCode: taxSnapshot.taxCode,
        amountMicros: account.autoRechargeAmountMicros,
        reconciliationNextAt: new Date(),
      },
    });
  } catch (error) {
    // The migration's partial unique index allows only one pending automatic
    // reload per wallet. A concurrent caller joins the winner.
    if (!isUniqueConstraintError(error)) throw error;
    const raced = options.contextKey
      ? await prisma.topUp.findUnique({
          where: {
            billingAccountId_automaticContextKey: {
              billingAccountId: account.billingAccountId,
              automaticContextKey: options.contextKey,
            },
          },
        })
      : await prisma.topUp.findFirst({
          where: {
            billingAccountId: account.billingAccountId,
            status: "PENDING",
            kind: TopUpKind.AUTOMATIC,
          },
          orderBy: { createdAt: "desc" },
        });
    if (!raced) throw error;
    if (raced.status !== "PENDING") {
      return {
        triggered: false,
        reason: "context_already_attempted",
        topUpId: raced.topUpId,
      };
    }
    topUp = raced;
  }
  return confirmAutomaticTopUp({
    topUpId: topUp.topUpId,
    customerId: account.organization.stripeCustomerId,
    paymentMethodId: account.stripePaymentMethodId,
    reason,
  });
}

async function confirmAutomaticTopUp(args: {
  topUpId: string;
  customerId: string;
  paymentMethodId: string;
  reason: "threshold" | "number_renewal";
}) {
  const now = new Date();
  const processingToken = randomUUID();
  const claimed = await prisma.topUp.updateMany({
    where: {
      topUpId: args.topUpId,
      kind: TopUpKind.AUTOMATIC,
      status: "PENDING",
      AND: [
        {
          OR: [
            { processingExpiresAt: null },
            { processingExpiresAt: { lte: now } },
          ],
        },
        {
          OR: [
            { reconciliationNextAt: null },
            { reconciliationNextAt: { lte: now } },
          ],
        },
      ],
    },
    data: {
      processingToken,
      processingExpiresAt: new Date(
        now.getTime() + AUTOMATIC_PROCESSING_LEASE_MS,
      ),
      reconciliationAttempts: { increment: 1 },
    },
  });
  if (claimed.count === 0) {
    return {
      triggered: false,
      reason: "already_processing",
      topUpId: args.topUpId,
    };
  }
  const topUp = await prisma.topUp.findUniqueOrThrow({
    where: { topUpId: args.topUpId },
  });
  let createdPaymentIntent: {
    id: string;
    status: Stripe.PaymentIntent.Status;
  } | null = null;
  try {
    if (topUp.stripePaymentIntentId) {
      const existingIntent = await stripeClient.paymentIntents.retrieve(
        topUp.stripePaymentIntentId,
      );
      createdPaymentIntent = {
        id: existingIntent.id,
        status: existingIntent.status,
      };
      await reconcileAutomaticPaymentIntent(
        topUp,
        existingIntent,
        processingToken,
      );
      return {
        triggered: existingIntent.status === "succeeded",
        topUpId: topUp.topUpId,
        paymentIntentId: existingIntent.id,
        status: existingIntent.status,
      };
    }
    const tax = await automaticTopUpTax(topUp, args.customerId);
    const paymentIntent = await stripeClient.paymentIntents.create(
      {
        amount: tax.amountTotalCents,
        currency: "usd",
        customer: args.customerId,
        payment_method: args.paymentMethodId,
        confirm: true,
        off_session: true,
        ...(tax.calculationId
          ? {
              hooks: {
                inputs: { tax: { calculation: tax.calculationId } },
              },
            }
          : {}),
        metadata: stripeMetadata({
          kind: AUTO_RECHARGE_KIND,
          organizationId: topUp.organizationId,
          topUpId: topUp.topUpId,
          amountMicros: topUp.amountMicros,
          reason: args.reason,
        }),
      },
      { idempotencyKey: `payment-intent:${topUp.topUpId}` },
    );
    createdPaymentIntent = {
      id: paymentIntent.id,
      status: paymentIntent.status,
    };
    await reconcileAutomaticPaymentIntent(
      { ...topUp, stripePaymentIntentId: paymentIntent.id },
      paymentIntent,
      processingToken,
    );
    return {
      triggered: true,
      topUpId: topUp.topUpId,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    };
  } catch (error) {
    if (createdPaymentIntent) {
      // The charge exists and its webhook is authoritative. Never mark this
      // failed merely because the local post-create update lost connectivity.
      await prisma.topUp
        .updateMany({
          where: { topUpId: topUp.topUpId, processingToken },
          data: {
            stripePaymentIntentId: createdPaymentIntent.id,
            processingToken: null,
            processingExpiresAt: null,
            reconciliationNextAt: new Date(
              Date.now() + RECONCILIATION_RETRY_MS,
            ),
          },
        })
        .catch(() => undefined);
      console.error(
        "[billing] automatic reload created but local update failed",
        {
          topUpId: topUp.topUpId,
          paymentIntentId: createdPaymentIntent.id,
          error: safeStripeError(error),
        },
      );
      return {
        triggered: true,
        topUpId: topUp.topUpId,
        paymentIntentId: createdPaymentIntent.id,
        status: createdPaymentIntent.status,
      };
    }
    const paymentIntentId = stripePaymentIntentIdFromError(error);
    const retryable = isRetryableStripeError(error);
    await prisma.topUp.updateMany({
      where: { topUpId: topUp.topUpId, processingToken },
      data: {
        status: retryable ? "PENDING" : "FAILED",
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
        failureCode: stripeErrorCode(error),
        failureMessage: safeStripeError(error),
        processingToken: null,
        processingExpiresAt: null,
        reconciliationNextAt: retryable
          ? new Date(Date.now() + RECONCILIATION_RETRY_MS)
          : null,
      },
    });
    return {
      triggered: false,
      reason: retryable ? "payment_retry_scheduled" : "payment_failed",
      topUpId: topUp.topUpId,
    };
  }
}

async function reconcileAutomaticPaymentIntent(
  topUp: TopUp,
  paymentIntent: Stripe.PaymentIntent,
  processingToken: string,
) {
  if (
    paymentIntent.metadata.top_up_id &&
    paymentIntent.metadata.top_up_id !== topUp.topUpId
  ) {
    throw new Error("Stripe PaymentIntent does not match the automatic reload");
  }
  if (paymentIntent.status === "succeeded") {
    await fulfillPaymentIntent(
      paymentIntent,
      `automatic-reconciliation:${paymentIntent.id}`,
    );
    return;
  }
  const failed = isTerminalOrActionRequired(paymentIntent.status);
  await prisma.topUp.updateMany({
    where: { topUpId: topUp.topUpId, processingToken },
    data: {
      stripePaymentIntentId: paymentIntent.id,
      status: failed ? "FAILED" : "PENDING",
      failureCode: failed ? paymentIntent.status : null,
      failureMessage: failed
        ? "Automatic reload requires customer action or a new payment method"
        : null,
      processingToken: null,
      processingExpiresAt: null,
      reconciliationNextAt: failed
        ? null
        : new Date(Date.now() + RECONCILIATION_RETRY_MS),
    },
  });
}

export async function processStripeWalletEvent(event: Stripe.Event) {
  if (!isHostedBilling) return;

  const payload = JSON.parse(JSON.stringify(event));
  const existing = await prisma.stripeWebhookEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      type: event.type,
      livemode: event.livemode,
      payload,
    },
    update: {},
  });
  if (existing?.status === "PROCESSED") return;
  const [claim] = await prisma.stripeWebhookEvent.updateManyAndReturn({
    where: {
      stripeEventId: event.id,
      OR: [
        { status: { in: ["RECEIVED", "FAILED"] } },
        {
          status: "PROCESSING",
          updatedAt: {
            lte: new Date(Date.now() - WEBHOOK_PROCESSING_LEASE_MS),
          },
        },
      ],
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lastError: null,
      processedAt: null,
    },
    select: { attempts: true },
  });
  if (!claim) {
    const current = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { status: true },
    });
    if (current?.status === "PROCESSED") return;
    throw new Error("Stripe wallet event is already being processed");
  }

  const claimFence = {
    stripeEventId: event.id,
    status: "PROCESSING" as const,
    attempts: claim.attempts,
  };
  await runClaimedWebhookAttempt({
    process: () => handleWalletEvent(event),
    complete: async (organizationId) => {
      const completed = await prisma.stripeWebhookEvent.updateMany({
        where: claimFence,
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          ...(organizationId ? { organizationId } : {}),
        },
      });
      return completed.count === 1;
    },
    fail: async (error) => {
      await prisma.stripeWebhookEvent.updateMany({
        where: claimFence,
        data: { status: "FAILED", lastError: safeStripeError(error) },
      });
    },
  });
}

async function handleWalletEvent(event: Stripe.Event): Promise<string | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return fulfillCheckoutSession(event.data.object, event.id);
    case "checkout.session.async_payment_failed":
      return failCheckoutSession(event.data.object);
    case "payment_intent.succeeded":
      return fulfillPaymentIntent(event.data.object, event.id);
    case "payment_intent.payment_failed":
      return failPaymentIntent(event.data.object);
    case "setup_intent.succeeded":
      return saveSetupIntentPaymentMethod(event.data.object);
    case "charge.refunded":
      return processChargeRefunds(event.data.object);
    case "charge.dispute.created":
      return processDisputeCreated(event.data.object, event.id);
    case "charge.dispute.closed":
      return processDisputeClosed(event.data.object, event.id);
    default:
      return null;
  }
}

async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
  eventId: string,
) {
  if (session.metadata?.kind !== TOP_UP_KIND) return null;
  const organizationId = session.metadata.organization_id;
  const topUpId = session.metadata.top_up_id;
  if (!organizationId || !topUpId || session.payment_status === "unpaid") {
    return organizationId ?? null;
  }
  await validateTopUpPayment({
    topUpId,
    organizationId,
    currency: session.currency,
    amountCents: session.amount_subtotal,
    customerId: stripeId(session.customer),
    expectedKind: TopUpKind.MANUAL,
  });
  const paymentIntentId = stripeId(session.payment_intent);
  await fulfillTopUp({
    topUpId,
    organizationId,
    paymentIntentId,
    taxMicros: BigInt(session.total_details?.amount_tax ?? 0) * MICROS_PER_CENT,
    eventId,
  });
  if (paymentIntentId)
    await savePaymentMethodFromIntent(organizationId, paymentIntentId);
  return organizationId;
}

async function fulfillPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  eventId: string,
) {
  const kind = paymentIntent.metadata.kind;
  // Checkout is authoritative for manual top-ups because it exposes the
  // principal subtotal separately from Automatic Tax. Its PaymentIntent amount
  // includes tax and must never be mistaken for wallet principal.
  if (kind !== AUTO_RECHARGE_KIND) return null;
  const organizationId = paymentIntent.metadata.organization_id;
  const topUpId = paymentIntent.metadata.top_up_id;
  if (!organizationId || !topUpId) return null;
  const topUp = await validateTopUpPayment({
    topUpId,
    organizationId,
    currency: paymentIntent.currency,
    amountCents: paymentIntent.amount,
    customerId: stripeId(paymentIntent.customer),
    taxIncluded: true,
    expectedKind: TopUpKind.AUTOMATIC,
  });
  await fulfillTopUp({
    topUpId,
    organizationId,
    paymentIntentId: paymentIntent.id,
    taxMicros: topUp.taxMicros,
    eventId,
  });
  return organizationId;
}

async function fulfillTopUp(args: {
  topUpId: string;
  organizationId: string;
  paymentIntentId: string | null;
  taxMicros: bigint;
  eventId: string;
}) {
  const topUp = await prisma.topUp.findFirst({
    where: { topUpId: args.topUpId, organizationId: args.organizationId },
  });
  if (!topUp) throw new Error("Stripe top-up does not match a wallet request");
  if (topUp.taxMicros !== 0n && topUp.taxMicros !== args.taxMicros) {
    throw new Error("Stripe top-up tax does not match the stored tax snapshot");
  }
  await creditWallet({
    organizationId: args.organizationId,
    amountMicros: topUp.amountMicros,
    idempotencyKey: `stripe-credit:${topUp.topUpId}`,
    referenceType: "top_up",
    referenceId: topUp.topUpId,
    description: "Stripe wallet top-up",
    metadata: {
      stripeEventId: args.eventId,
      stripePaymentIntentId: args.paymentIntentId,
    },
  });
  await prisma.topUp.update({
    where: { topUpId: topUp.topUpId },
    data: {
      status: financialTopUpStatus({
        creditedMicros: topUp.amountMicros,
        refundedMicros: topUp.refundedMicros,
        disputedMicros: topUp.disputedMicros,
      }),
      creditedMicros: topUp.amountMicros,
      taxMicros: args.taxMicros,
      ...(args.paymentIntentId
        ? { stripePaymentIntentId: args.paymentIntentId }
        : {}),
      completedAt: topUp.completedAt ?? new Date(),
      failureCode: null,
      failureMessage: null,
      processingToken: null,
      processingExpiresAt: null,
      reconciliationNextAt: null,
    },
  });
  await reconcileTopUpFinancialState(topUp.topUpId);
  // A successful reload can recover a number before the next daily retry.
  // Dynamic import avoids a module cycle through number billing -> Stripe.
  const { retrySuspendedNumberRenewalsAfterCredit } =
    await import("../numbers/number-billing.service.js");
  await retrySuspendedNumberRenewalsAfterCredit(args.organizationId).catch(
    (error) => {
      console.error("[billing] failed to retry suspended number after reload", {
        organizationId: args.organizationId,
        error: safeStripeError(error),
      });
    },
  );
}

async function validateTopUpPayment(args: {
  topUpId: string;
  organizationId: string;
  currency: string | null;
  amountCents: number | null;
  customerId: string | null;
  taxIncluded?: boolean;
  expectedKind: TopUpKind;
}) {
  const topUp = await prisma.topUp.findFirst({
    where: { topUpId: args.topUpId, organizationId: args.organizationId },
    include: { organization: { select: { stripeCustomerId: true } } },
  });
  if (!topUp) throw new Error("Stripe top-up does not match a wallet request");
  if (
    args.currency?.toLowerCase() !== "usd" ||
    topUp.kind !== args.expectedKind ||
    args.amountCents === null ||
    BigInt(args.amountCents) * MICROS_PER_CENT !==
      topUp.amountMicros + (args.taxIncluded ? topUp.taxMicros : 0n) ||
    !args.customerId ||
    args.customerId !== topUp.organization.stripeCustomerId
  ) {
    throw new Error(
      "Stripe top-up amount, currency, or customer does not match",
    );
  }
  return topUp;
}

async function saveSetupIntentPaymentMethod(setupIntent: Stripe.SetupIntent) {
  if (setupIntent.metadata?.kind !== PAYMENT_METHOD_KIND) return null;
  const organizationId = setupIntent.metadata?.organization_id;
  const paymentMethodId = stripeId(setupIntent.payment_method);
  if (!organizationId || !paymentMethodId) return organizationId ?? null;
  const version = Number(setupIntent.metadata?.payment_method_version);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error(
      "Stripe SetupIntent is missing a valid payment-method version",
    );
  }
  const account = await prisma.billingAccount.findUnique({
    where: { organizationId },
    include: { organization: { select: { stripeCustomerId: true } } },
  });
  if (!account) throw new Error("Stripe SetupIntent has no billing account");
  const customerId = stripeId(setupIntent.customer);
  if (!customerId || customerId !== account.organization.stripeCustomerId) {
    throw new Error(
      "Stripe SetupIntent customer does not match the organization",
    );
  }
  const applied = await prisma.billingAccount.updateMany({
    where: {
      organizationId,
      paymentMethodRequestVersion: version,
      paymentMethodAppliedVersion: { lt: version },
    },
    data: {
      stripePaymentMethodId: paymentMethodId,
      paymentMethodAppliedVersion: version,
    },
  });
  if (applied.count === 1) {
    await copyPaymentMethodAddressToCustomer(customerId, paymentMethodId);
  }
  return organizationId;
}

async function savePaymentMethodFromIntent(
  organizationId: string,
  paymentIntentId: string,
) {
  const intent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
  const paymentMethodId = stripeId(intent.payment_method);
  if (!paymentMethodId) return;
  const account = await prisma.billingAccount.findUnique({
    where: { organizationId },
    include: { organization: { select: { stripeCustomerId: true } } },
  });
  if (!account) throw new Error("Stripe PaymentIntent has no billing account");
  const customerId = stripeId(intent.customer);
  if (!customerId || customerId !== account.organization.stripeCustomerId) {
    throw new Error(
      "Stripe PaymentIntent customer does not match the organization",
    );
  }
  // Checkout may seed the first reusable method. Only an explicitly versioned
  // SetupIntent is allowed to replace an existing method.
  const applied = await prisma.billingAccount.updateMany({
    where: {
      organizationId,
      stripePaymentMethodId: null,
      paymentMethodRequestVersion: 0,
    },
    data: { stripePaymentMethodId: paymentMethodId },
  });
  if (applied.count === 1) {
    await copyPaymentMethodAddressToCustomer(customerId, paymentMethodId);
  }
}

async function automaticTopUpTax(topUp: TopUp, customerId: string) {
  const principalCents = Number(topUp.amountMicros / MICROS_PER_CENT);
  if (topUp.taxMode === TopUpTaxMode.DISABLED) {
    if (topUp.taxMicros !== 0n || topUp.stripeTaxCalculationId) {
      throw new Error("Tax-disabled top-up contains Stripe Tax state");
    }
    return { amountTotalCents: principalCents, calculationId: null };
  }
  const taxCode = requiredTopUpTaxCode(topUp);

  const calculation = topUp.stripeTaxCalculationId
    ? await stripeClient.tax.calculations.retrieve(topUp.stripeTaxCalculationId)
    : await stripeClient.tax.calculations.create(
        {
          currency: "usd",
          customer: customerId,
          line_items: [
            {
              amount: principalCents,
              reference: topUp.topUpId,
              tax_behavior: "exclusive",
              tax_code: taxCode,
            },
          ],
        },
        { idempotencyKey: `tax-calculation:${topUp.topUpId}` },
      );
  if (!calculation.id)
    throw new Error("Stripe Tax did not return a calculation ID");
  if (
    calculation.expires_at !== null &&
    calculation.expires_at <= Math.floor(Date.now() / 1_000)
  ) {
    throw new Error("Stripe Tax calculation expired before automatic reload");
  }
  const taxCents = calculation.amount_total - principalCents;
  if (taxCents < 0) {
    throw new Error("Stripe Tax returned a total below the wallet principal");
  }
  await prisma.topUp.update({
    where: { topUpId: topUp.topUpId },
    data: {
      stripeTaxCalculationId: calculation.id,
      taxMicros: BigInt(taxCents) * MICROS_PER_CENT,
    },
  });
  return {
    amountTotalCents: calculation.amount_total,
    calculationId: calculation.id,
  };
}

async function copyPaymentMethodAddressToCustomer(
  customerId: string | null,
  paymentMethodId: string,
) {
  if (!customerId) return;
  const paymentMethod =
    await stripeClient.paymentMethods.retrieve(paymentMethodId);
  const address = paymentMethod.billing_details.address;
  if (!address?.country) return;
  await stripeClient.customers.update(customerId, {
    address: {
      country: address.country,
      ...(address.city ? { city: address.city } : {}),
      ...(address.line1 ? { line1: address.line1 } : {}),
      ...(address.line2 ? { line2: address.line2 } : {}),
      ...(address.postal_code ? { postal_code: address.postal_code } : {}),
      ...(address.state ? { state: address.state } : {}),
    },
    ...(paymentMethod.billing_details.name
      ? { name: paymentMethod.billing_details.name }
      : {}),
  });
}

async function failCheckoutSession(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organization_id;
  const topUpId = session.metadata?.top_up_id;
  if (topUpId) {
    await prisma.topUp.updateMany({
      where: { topUpId, status: "PENDING" },
      data: { status: "FAILED", failureMessage: "Checkout payment failed" },
    });
  }
  return organizationId ?? null;
}

async function failPaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  const organizationId = paymentIntent.metadata.organization_id;
  const topUpId = paymentIntent.metadata.top_up_id;
  if (topUpId) {
    await prisma.topUp.updateMany({
      where: { topUpId, status: "PENDING" },
      data: {
        status: "FAILED",
        stripePaymentIntentId: paymentIntent.id,
        failureCode: paymentIntent.last_payment_error?.code ?? null,
        failureMessage:
          paymentIntent.last_payment_error?.message ?? "Payment failed",
      },
    });
  }
  return organizationId ?? null;
}

async function processChargeRefunds(charge: Stripe.Charge) {
  const topUp = await resolveTopUpForPaymentIntent(
    stripeId(charge.payment_intent),
  );
  if (!topUp) return null;
  await recordFinancialTarget(topUp.topUpId, (current) => ({
    refundTargetProviderCents: maxBigInt(
      current.refundTargetProviderCents,
      BigInt(charge.amount_refunded),
    ),
  }));
  await reconcileTopUpFinancialState(topUp.topUpId);
  return topUp.organizationId;
}

async function processDisputeCreated(dispute: Stripe.Dispute, eventId: string) {
  return recordDisputeTarget(
    dispute,
    stripeDisputeState(dispute.status),
    eventId,
  );
}

async function processDisputeClosed(dispute: Stripe.Dispute, eventId: string) {
  return recordDisputeTarget(
    dispute,
    stripeDisputeState(dispute.status),
    eventId,
  );
}

async function recordDisputeTarget(
  dispute: Stripe.Dispute,
  state: DurableDisputeState,
  _eventId: string,
) {
  const charge = await resolveDisputeCharge(dispute);
  const topUp = await resolveTopUpForPaymentIntent(
    stripeId(charge.payment_intent),
  );
  if (!topUp) return null;
  await recordFinancialTarget(topUp.topUpId, (current) => ({
    disputeTargetProviderCents: maxBigInt(
      current.disputeTargetProviderCents,
      BigInt(dispute.amount),
    ),
    stripeDisputeId: dispute.id,
    disputeState: mergeDisputeState(current.disputeState, state),
  }));
  await reconcileTopUpFinancialState(topUp.topUpId);
  return topUp.organizationId;
}

async function recordFinancialTarget(
  topUpId: string,
  update: (current: TopUp) => {
    refundTargetProviderCents?: bigint;
    disputeTargetProviderCents?: bigint;
    stripeDisputeId?: string;
    disputeState?: string;
  },
) {
  return withSerializableRetries(async (tx) => {
    const current = await tx.topUp.findUniqueOrThrow({ where: { topUpId } });
    await tx.topUp.update({
      where: { topUpId },
      data: {
        ...update(current),
        financialReconciliationPending: true,
      },
    });
  });
}

async function resolveDisputeCharge(dispute: Stripe.Dispute) {
  const chargeId = stripeId(dispute.charge);
  if (!chargeId) throw new Error("Stripe dispute has no charge");
  return stripeClient.charges.retrieve(chargeId);
}

async function resolveTopUpForPaymentIntent(paymentIntentId: string | null) {
  if (!paymentIntentId) return null;
  const mapped = await prisma.topUp.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { organization: { select: { stripeCustomerId: true } } },
  });
  if (mapped) return mapped;

  // Refund/dispute webhooks can arrive before the success webhook stores the
  // PaymentIntent ID. Recover the durable TopUp identity from Stripe metadata.
  const intent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
  if (
    intent.metadata.kind !== TOP_UP_KIND &&
    intent.metadata.kind !== AUTO_RECHARGE_KIND
  ) {
    return null;
  }
  const topUpId = intent.metadata.top_up_id;
  const organizationId = intent.metadata.organization_id;
  if (!topUpId || !organizationId) {
    throw new Error("QuickVoice PaymentIntent is missing wallet metadata");
  }
  const topUp = await prisma.topUp.findFirst({
    where: { topUpId, organizationId },
    include: { organization: { select: { stripeCustomerId: true } } },
  });
  if (!topUp) throw new Error("Stripe PaymentIntent has no matching TopUp");
  const metadataAmount = intent.metadata.amount_micros;
  if (
    intent.currency.toLowerCase() !== "usd" ||
    stripeId(intent.customer) !== topUp.organization.stripeCustomerId ||
    metadataAmount !== topUp.amountMicros.toString() ||
    (topUp.kind === TopUpKind.AUTOMATIC &&
      BigInt(intent.amount) * MICROS_PER_CENT !==
        topUp.amountMicros + topUp.taxMicros)
  ) {
    throw new Error(
      "Stripe PaymentIntent metadata or customer does not match TopUp",
    );
  }
  await prisma.topUp.updateMany({
    where: { topUpId, stripePaymentIntentId: null },
    data: { stripePaymentIntentId: paymentIntentId },
  });
  return topUp;
}

export async function reconcilePendingStripeTopUps(
  now = new Date(),
  limit = 50,
) {
  if (!isHostedBilling) return { skipped: true, automatic: 0, financial: 0 };

  const [automaticTopUps, financialTopUps] = await Promise.all([
    prisma.topUp.findMany({
      where: {
        kind: TopUpKind.AUTOMATIC,
        status: "PENDING",
        OR: [
          { reconciliationNextAt: null },
          { reconciliationNextAt: { lte: now } },
        ],
      },
      include: {
        billingAccount: {
          include: { organization: { select: { stripeCustomerId: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    }),
    prisma.topUp.findMany({
      where: {
        financialReconciliationPending: true,
        OR: [
          { financialProcessingExpiresAt: null },
          { financialProcessingExpiresAt: { lte: now } },
        ],
      },
      select: { topUpId: true },
      orderBy: { updatedAt: "asc" },
      take: limit,
    }),
  ]);

  let automatic = 0;
  for (const topUp of automaticTopUps) {
    const account = topUp.billingAccount;
    if (
      !account.stripePaymentMethodId ||
      !account.organization.stripeCustomerId
    ) {
      await prisma.topUp.updateMany({
        where: { topUpId: topUp.topUpId, status: "PENDING" },
        data: {
          status: "FAILED",
          failureCode: "payment_method_missing",
          failureMessage: "Automatic reload payment method is unavailable",
          reconciliationNextAt: null,
        },
      });
      continue;
    }
    await confirmAutomaticTopUp({
      topUpId: topUp.topUpId,
      customerId: account.organization.stripeCustomerId,
      paymentMethodId: account.stripePaymentMethodId,
      reason: topUp.automaticContextKey?.startsWith("number-renewal:")
        ? "number_renewal"
        : "threshold",
    });
    automatic += 1;
  }

  let financial = 0;
  for (const topUp of financialTopUps) {
    await reconcileTopUpFinancialState(topUp.topUpId);
    financial += 1;
  }
  return { skipped: false, automatic, financial };
}

async function reconcileTopUpFinancialState(topUpId: string) {
  const now = new Date();
  const processingToken = randomUUID();
  const claimed = await prisma.topUp.updateMany({
    where: {
      topUpId,
      financialReconciliationPending: true,
      OR: [
        { financialProcessingExpiresAt: null },
        { financialProcessingExpiresAt: { lte: now } },
      ],
    },
    data: {
      financialProcessingToken: processingToken,
      financialProcessingExpiresAt: new Date(
        now.getTime() + FINANCIAL_PROCESSING_LEASE_MS,
      ),
    },
  });
  if (claimed.count === 0) return { reconciled: false };

  try {
    // Target webhooks can advance while this lease is held. Re-read and retry
    // the compare-and-swap so the latest cumulative Stripe state wins.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const topUp = await prisma.topUp.findUniqueOrThrow({
        where: { topUpId },
      });
      if (topUp.creditedMicros === 0n) {
        // A refund/dispute can beat the payment-success webhook. Keep the
        // durable target pending; fulfillment invokes this reconciler again.
        return { reconciled: false, reason: "awaiting_fulfillment" };
      }
      const desired = financialPrincipalTargets({
        creditedMicros: topUp.creditedMicros,
        taxMicros: topUp.taxMicros,
        refundTargetProviderCents: topUp.refundTargetProviderCents,
        disputeTargetProviderCents: topUp.disputeTargetProviderCents,
        disputeState: topUp.disputeState,
      });
      let applied = await financialLedgerProgress(topUp.topUpId);

      // Restore no-longer-applicable dispute holds before applying a refund,
      // avoiding even a transient double debit of the same principal.
      if (applied.disputedMicros > desired.disputedMicros) {
        const restoreMicros = applied.disputedMicros - desired.disputedMicros;
        await creditWallet({
          organizationId: topUp.organizationId,
          amountMicros: restoreMicros,
          idempotencyKey: `stripe-dispute-release-target:${topUp.topUpId}:${desired.disputedMicros}`,
          type: BillingTransactionType.ADJUSTMENT,
          referenceType: "stripe_dispute_release_top_up",
          referenceId: topUp.topUpId,
          description: "Stripe dispute hold released",
          metadata: {
            topUpId: topUp.topUpId,
            disputeState: topUp.disputeState,
            principalTargetMicros: desired.disputedMicros.toString(),
          },
        });
        applied = await financialLedgerProgress(topUp.topUpId);
      }

      const refundDelta = unappliedFinancialDelta(
        desired.refundedMicros,
        applied.refundedMicros,
      );
      if (refundDelta > 0n) {
        await reverseWalletCredit({
          organizationId: topUp.organizationId,
          amountMicros: refundDelta,
          idempotencyKey: `stripe-refund-target:${topUp.topUpId}:${desired.refundedMicros}`,
          transactionType: "REFUND",
          referenceType: "stripe_refund_top_up",
          referenceId: topUp.topUpId,
          description: "Stripe top-up refund",
          metadata: {
            topUpId: topUp.topUpId,
            providerTargetCents: topUp.refundTargetProviderCents.toString(),
            principalTargetMicros: desired.refundedMicros.toString(),
          },
        });
      }

      applied = await financialLedgerProgress(topUp.topUpId);
      const disputeDelta = unappliedFinancialDelta(
        desired.disputedMicros,
        applied.disputedMicros,
      );
      if (disputeDelta > 0n) {
        await reverseWalletCredit({
          organizationId: topUp.organizationId,
          amountMicros: disputeDelta,
          idempotencyKey: `stripe-dispute-target:${topUp.topUpId}:${desired.disputedMicros}`,
          transactionType: "DISPUTE",
          referenceType: "stripe_dispute_top_up",
          referenceId: topUp.topUpId,
          description: "Stripe payment disputed",
          metadata: {
            topUpId: topUp.topUpId,
            stripeDisputeId: topUp.stripeDisputeId,
            principalTargetMicros: desired.disputedMicros.toString(),
          },
        });
      }

      applied = await financialLedgerProgress(topUp.topUpId);
      const completed = await prisma.topUp.updateMany({
        where: {
          topUpId: topUp.topUpId,
          financialProcessingToken: processingToken,
          refundTargetProviderCents: topUp.refundTargetProviderCents,
          disputeTargetProviderCents: topUp.disputeTargetProviderCents,
          disputeState: topUp.disputeState,
        },
        data: {
          refundedMicros: applied.refundedMicros,
          disputedMicros: applied.disputedMicros,
          status: financialTopUpStatus({
            creditedMicros: topUp.creditedMicros,
            refundedMicros: applied.refundedMicros,
            disputedMicros: applied.disputedMicros,
          }),
          financialReconciliationPending: false,
          financialProcessingToken: null,
          financialProcessingExpiresAt: null,
        },
      });
      if (completed.count === 1) return { reconciled: true };
    }
    return { reconciled: false, reason: "target_advanced" };
  } finally {
    await prisma.topUp.updateMany({
      where: { topUpId, financialProcessingToken: processingToken },
      data: {
        financialProcessingToken: null,
        financialProcessingExpiresAt: null,
      },
    });
  }
}

async function financialLedgerProgress(topUpId: string) {
  const [refunds, disputeDebits, disputeReleases] = await Promise.all([
    prisma.billingTransaction.aggregate({
      where: {
        type: BillingTransactionType.REFUND,
        referenceType: "stripe_refund_top_up",
        referenceId: topUpId,
      },
      _sum: { grossAmountMicros: true },
    }),
    prisma.billingTransaction.aggregate({
      where: {
        type: BillingTransactionType.DISPUTE,
        referenceType: "stripe_dispute_top_up",
        referenceId: topUpId,
      },
      _sum: { grossAmountMicros: true },
    }),
    prisma.billingTransaction.aggregate({
      where: {
        type: BillingTransactionType.ADJUSTMENT,
        referenceType: "stripe_dispute_release_top_up",
        referenceId: topUpId,
      },
      _sum: { grossAmountMicros: true },
    }),
  ]);
  const disputeDebitedMicros = disputeDebits._sum.grossAmountMicros ?? 0n;
  const disputeReleasedMicros = disputeReleases._sum.grossAmountMicros ?? 0n;
  return {
    refundedMicros: refunds._sum.grossAmountMicros ?? 0n,
    disputedMicros:
      disputeDebitedMicros > disputeReleasedMicros
        ? disputeDebitedMicros - disputeReleasedMicros
        : 0n,
  };
}

async function withSerializableRetries<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !isTransactionConflict(error) ||
        attempt === MAX_SERIALIZABLE_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
  throw new Error("Serializable billing transaction did not complete");
}

async function ensureBillingAccountRecord(organizationId: string) {
  return prisma.billingAccount.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

async function ensureOrganizationStripeCustomer(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, stripeCustomerId: true },
  });
  if (!organization) throw new BadRequestError("Organization not found");
  if (organization.stripeCustomerId) return organization.stripeCustomerId;

  const customer = await stripeClient.customers.create(
    {
      name: organization.name,
      metadata: { organization_id: organization.id },
    },
    { idempotencyKey: `quickvoice-organization:${organization.id}` },
  );
  await prisma.organization.updateMany({
    where: { id: organization.id, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });
  const current = await prisma.organization.findUnique({
    where: { id: organization.id },
    select: { stripeCustomerId: true },
  });
  const resolution = organizationStripeCustomerResolution({
    createdCustomerId: customer.id,
    durableCustomerId: current?.stripeCustomerId,
  });
  if (resolution.deleteCreatedCustomer) {
    await deleteStripeCustomerIdempotently(customer.id);
  }
  if (!resolution.customerId) {
    throw new BadRequestError(
      "Organization is no longer available for Stripe billing",
    );
  }
  return resolution.customerId;
}

async function deleteStripeCustomerIdempotently(customerId: string) {
  try {
    await stripeClient.customers.del(customerId);
  } catch (error) {
    if (stripeErrorCode(error) !== "resource_missing") throw error;
  }
}

function requireHostedPayments() {
  if (!isHostedBilling) {
    throw new CustomApiError(
      "QuickVoice billing is disabled in self-hosted mode",
      409,
      { code: "BILLING_DISABLED" },
    );
  }
}

function requiredWalletTaxCode() {
  const taxCode = process.env.STRIPE_WALLET_TAX_CODE?.trim();
  if (!taxCode) {
    throw new Error(
      "STRIPE_WALLET_TAX_CODE is required when Stripe Automatic Tax is enabled",
    );
  }
  return taxCode;
}

function currentTaxSnapshot() {
  if (process.env.STRIPE_AUTOMATIC_TAX_ENABLED !== "true") {
    return { mode: TopUpTaxMode.DISABLED, taxCode: null };
  }
  return {
    mode: TopUpTaxMode.STRIPE_TAX,
    taxCode: requiredWalletTaxCode(),
  };
}

function requiredTopUpTaxCode(topUp: Pick<TopUp, "stripeTaxCode">) {
  const taxCode = topUp.stripeTaxCode?.trim();
  if (!taxCode) throw new Error("TopUp Stripe Tax snapshot has no tax code");
  return taxCode;
}

function consoleBaseUrl() {
  return (
    process.env.CONSOLE_URL?.split(",")[0]?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

function stripeMetadata(values: Record<string, string | bigint>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      String(value),
    ]),
  );
}

function stripeId(value: string | { id: string } | null): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function safeStripeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "Stripe request failed";
}

function stripeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : null;
}

function stripePaymentIntentIdFromError(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const intent = (error as { payment_intent?: unknown }).payment_intent;
  if (typeof intent === "string") return intent;
  if (intent && typeof intent === "object") {
    const id = (intent as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function isRetryableStripeError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const type = (error as { type?: unknown }).type;
  const code = (error as { code?: unknown }).code;
  return (
    type === "StripeAPIError" ||
    type === "StripeConnectionError" ||
    type === "StripeRateLimitError" ||
    code === "api_connection_error" ||
    code === "rate_limit" ||
    code === "idempotency_key_in_use"
  );
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "P2002",
  );
}

function isTransactionConflict(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "P2034",
  );
}

function isTerminalOrActionRequired(status: Stripe.PaymentIntent.Status) {
  return (
    status === "canceled" ||
    status === "requires_action" ||
    status === "requires_payment_method"
  );
}

type WalletCreditArgs = {
  organizationId: string;
  amountMicros: bigint;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  type?:
    | typeof BillingTransactionType.TOP_UP
    | typeof BillingTransactionType.ADJUSTMENT;
};

async function creditWallet(args: WalletCreditArgs) {
  const ledger = (await import("./wallet-ledger.service.js")) as unknown as {
    creditPaidBalance: (input: WalletCreditArgs) => Promise<unknown>;
  };
  return ledger.creditPaidBalance(args);
}

type WalletReversalArgs = Omit<WalletCreditArgs, "type"> & {
  transactionType:
    | typeof BillingTransactionType.REFUND
    | typeof BillingTransactionType.DISPUTE;
};

async function reverseWalletCredit(args: WalletReversalArgs) {
  const { transactionType, ...rest } = args;
  const ledger = (await import("./wallet-ledger.service.js")) as unknown as {
    reversePaidCredit: (
      input: Omit<WalletReversalArgs, "transactionType"> & {
        type:
          | typeof BillingTransactionType.REFUND
          | typeof BillingTransactionType.DISPUTE;
      },
    ) => Promise<unknown>;
  };
  return ledger.reversePaidCredit({ ...rest, type: transactionType });
}

function maxBigInt(left: bigint, right: bigint) {
  return left > right ? left : right;
}
