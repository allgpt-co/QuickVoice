import { randomUUID } from "node:crypto";

import {
  BillingReservationPurpose,
  PhoneNumberBillingStatus,
  TelephonyProvider,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { telnyxClient } from "../../config/telnyx.js";
import { twilioClient } from "../../config/twilio.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import { sendNumberBillingNotice } from "../../lib/mailer.js";
import setLiveKitBinding from "../../common/utils/setLiveKitBinding.js";
import setProviderBinding from "../../common/utils/setProviderBinding.js";
import {
  calculateNumberRentalPriceMicros,
  getRateCatalog,
} from "../billing/rate-catalog.service.js";
import { formatMicrosAsUsd, parseUsdToMicros } from "../billing/money.js";
import {
  InsufficientCreditError,
  releaseReservation,
  reservePaidNumberCredit,
  settleReservation,
} from "../billing/wallet-ledger.service.js";
import { triggerAutoRecharge } from "../billing/stripe-wallet.service.js";
import { numberBillingOperationStore } from "./number-billing-operation.repository.js";
import { settleRenewalUnderClaim } from "./number-renewal-fence.js";
import {
  NUMBER_BILLING_OPERATION_LEASE_MS,
  NumberReleaseService,
  type LastChanceRenewalResult,
} from "./number-release.service.js";
import * as phoneRepository from "./phone.repository.js";
import { deleteNumber, linkAgentToNumber } from "./phone.service.js";
import {
  exactTelnyxNumberMrcMicros,
  telnyxChargesBreakdownWindow,
} from "./telnyx-number-renewal-price.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const RELEASE_GRACE_MS = 72 * 60 * 60 * 1_000;
type PhoneNumberRow = Awaited<
  ReturnType<typeof prisma.phoneNumber.findMany>
>[number];

export async function runPhoneNumberBilling(now = new Date()) {
  if (!isHostedBilling) {
    return { skipped: true, reason: "self_hosted" };
  }
  const notices = await sendPendingLegacyNumberNotices(now);
  const releases = await releaseExpiredSuspensions(now);
  const renewals = await retryDueNumberRenewals(now);
  const restored = await restorePaidNumberBindings();
  return { skipped: false, notices, releases, renewals, restored };
}

export async function retryDueNumberRenewals(
  now = new Date(),
  organizationId?: string,
) {
  const numbers = await prisma.phoneNumber.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      billingStatus: {
        in: [
          PhoneNumberBillingStatus.ACTIVE,
          PhoneNumberBillingStatus.SUSPENDED,
          PhoneNumberBillingStatus.RELEASE_PENDING,
        ],
      },
      nextBillingAt: { lte: now },
      AND: [
        {
          OR: [
            { lastBilledAt: { not: null } },
            { billingNoticeSentAt: { not: null } },
          ],
        },
      ],
      OR: [
        { lastBillingAttemptAt: null },
        { lastBillingAttemptAt: { lt: startOfUtcDay(now) } },
      ],
      NOT: {
        scheduledReleaseAt: { lte: now },
      },
    },
    orderBy: { nextBillingAt: "asc" },
  });
  const results = [];
  for (const number of numbers) {
    results.push(await renewNumber(number, now));
  }
  return results;
}

/** Bypasses the once-per-day throttle immediately after Stripe credits funds. */
export async function retrySuspendedNumberRenewalsAfterCredit(
  organizationId: string,
  now = new Date(),
) {
  if (!isHostedBilling) return [];
  const numbers = await prisma.phoneNumber.findMany({
    where: {
      organizationId,
      billingStatus: {
        in: [
          PhoneNumberBillingStatus.SUSPENDED,
          PhoneNumberBillingStatus.RELEASE_PENDING,
        ],
      },
      nextBillingAt: { lte: now },
      scheduledReleaseAt: { gt: now },
      AND: [
        {
          OR: [
            { lastBilledAt: { not: null } },
            { billingNoticeSentAt: { not: null } },
          ],
        },
      ],
    },
    orderBy: { nextBillingAt: "asc" },
  });
  const results = [];
  for (const number of numbers) results.push(await renewNumber(number, now));
  return results;
}

async function renewNumber(number: PhoneNumberRow, now: Date) {
  if (!number.nextBillingAt) {
    return { phId: number.phId, status: "not_due" as const };
  }

  const operationToken = randomUUID();
  const claimed = await numberBillingOperationStore.claimRenewal({
    phId: number.phId,
    organizationId: number.organizationId,
    expectedNextBillingAt: number.nextBillingAt,
    token: operationToken,
    now,
    leaseUntil: operationLeaseUntil(now),
  });
  if (!claimed) {
    return { phId: number.phId, status: "claim_lost" as const };
  }

  return renewClaimedNumber(claimed, now, operationToken, "scheduled");
}

async function renewClaimedNumber(
  number: PhoneNumberRow,
  now: Date,
  operationToken: string,
  mode: "scheduled" | "last_chance",
) {
  const billingDate = number.nextBillingAt ?? now;
  const periodKey = billingDate.toISOString();
  const reservationKey = `number-renewal:${number.phId}:${periodKey}`;
  let requiredPaidMicros =
    number.rentalPriceMicros ??
    calculateNumberRentalPriceMicros(
      number.providerMonthlyCostMicros ??
        defaultProviderNumberCost(number.provider),
    );
  try {
    const previousReservation = await prisma.billingReservation.findFirst({
      where: {
        organizationId: number.organizationId,
        purpose: BillingReservationPurpose.PHONE_NUMBER_RENEWAL,
        referenceType: "phone_number",
        referenceId: number.phId,
        idempotencyKey: { startsWith: reservationKey },
      },
      orderBy: { createdAt: "desc" },
    });
    const currentPrice =
      previousReservation?.status === "ACTIVE" ||
      previousReservation?.status === "SETTLED"
        ? {
            providerCostMicros:
              number.providerMonthlyCostMicros ??
              defaultProviderNumberCost(number.provider),
            countryIso: number.billingCountryIso,
            numberType: number.billingNumberType,
          }
        : await currentProviderNumberCost(number, now);
    const quotedRentalPriceMicros = calculateNumberRentalPriceMicros(
      currentPrice.providerCostMicros,
    );
    requiredPaidMicros = quotedRentalPriceMicros;
    const effectiveReservationKey =
      previousReservation?.status === "RELEASED"
        ? `${reservationKey}:retry:${previousReservation.billingReservationId}`
        : reservationKey;
    const reservation =
      previousReservation?.status === "ACTIVE" ||
      previousReservation?.status === "SETTLED"
        ? previousReservation
        : (
            await reservePaidNumberCredit({
              organizationId: number.organizationId,
              amountMicros: quotedRentalPriceMicros,
              idempotencyKey: effectiveReservationKey,
              purpose: BillingReservationPurpose.PHONE_NUMBER_RENEWAL,
              referenceType: "phone_number",
              referenceId: number.phId,
              description: "30-day phone number renewal reserve",
              expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
              metadata: {
                phoneNumber: number.number,
                provider: number.provider,
                billingDate: periodKey,
              },
            })
          ).reservation;
    const rentalPriceMicros = reservation.amountMicros;
    if (reservation.status !== "ACTIVE" && reservation.status !== "SETTLED") {
      throw new Error(
        `Phone number renewal reservation is ${reservation.status.toLowerCase()}`,
      );
    }

    const settlement = await settleRenewalUnderClaim({
      reservationState: reservation.status,
      refreshClaim: () =>
        numberBillingOperationStore.refreshOperation({
          phId: number.phId,
          organizationId: number.organizationId,
          token: operationToken,
          leaseUntil: operationLeaseUntil(),
        }),
      settleActiveReservation: async () => {
        await settleReservation({
          organizationId: number.organizationId,
          reservationId: reservation.billingReservationId,
          actualAmountMicros: rentalPriceMicros,
          idempotencyKey: `number-renewal:${reservation.billingReservationId}:settle`,
          description: "30-day phone number rental renewed",
          metadata: { phoneNumber: number.number, provider: number.provider },
        });
      },
      releaseActiveReservation: async () => {
        await releaseReservation({
          organizationId: number.organizationId,
          reservationId: reservation.billingReservationId,
          idempotencyKey: `number-renewal:${reservation.billingReservationId}:stale-claim-release`,
          description: "Released after phone number renewal claim was lost",
          metadata: { phoneNumber: number.number, provider: number.provider },
        });
      },
      onReleaseFailure: (error) => {
        console.error("[billing] failed to release stale renewal reserve", {
          phId: number.phId,
          reservationId: reservation.billingReservationId,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
    if (settlement === "claim_lost") {
      return { phId: number.phId, status: "claim_lost" as const };
    }

    const completed = await numberBillingOperationStore.completeRenewal({
      phId: number.phId,
      organizationId: number.organizationId,
      token: operationToken,
      input: {
        providerMonthlyCostMicros: currentPrice.providerCostMicros,
        rentalPriceMicros,
        billingRateCatalogVersion: getRateCatalog().catalogVersion,
        lastBilledAt: now,
        nextBillingAt: new Date(
          Math.max(now.getTime(), billingDate.getTime()) + THIRTY_DAYS_MS,
        ),
        billingCountryIso: currentPrice.countryIso,
        billingNumberType: currentPrice.numberType,
      },
    });
    if (!completed) {
      return { phId: number.phId, status: "claim_lost" as const };
    }

    await restoreNumberBinding(number.phId, number.organizationId);
    return { phId: number.phId, status: "renewed" as const };
  } catch (error) {
    if (!(error instanceof InsufficientCreditError)) {
      if (mode === "last_chance") {
        await numberBillingOperationStore.revertReleaseClaim({
          phId: number.phId,
          organizationId: number.organizationId,
          token: operationToken,
          now,
        });
      } else {
        await numberBillingOperationStore.recordRenewalFailure({
          phId: number.phId,
          organizationId: number.organizationId,
          token: operationToken,
          now,
        });
      }
      console.error(
        "[billing] failed to obtain or apply current number price",
        {
          phId: number.phId,
          provider: number.provider,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {
        phId: number.phId,
        status:
          mode === "last_chance"
            ? ("retry" as const)
            : ("pricing_unavailable" as const),
      };
    }

    if (mode === "last_chance") {
      try {
        const recharge = await triggerAutoRecharge(
          number.organizationId,
          "number_renewal",
          {
            requiredPaidMicros,
            contextKey: reservationKey,
          },
        );
        const rechargeReason =
          "reason" in recharge ? recharge.reason : undefined;
        if (
          recharge.triggered ||
          rechargeReason === "already_processing" ||
          rechargeReason === "sufficient_paid_credit"
        ) {
          await numberBillingOperationStore.revertReleaseClaim({
            phId: number.phId,
            organizationId: number.organizationId,
            token: operationToken,
            now,
          });
          return { phId: number.phId, status: "retry" as const };
        }
      } catch (rechargeError) {
        // A timeout can happen after Stripe accepted the PaymentIntent. Keep
        // the number until reconciliation can establish the funding outcome.
        await numberBillingOperationStore.revertReleaseClaim({
          phId: number.phId,
          organizationId: number.organizationId,
          token: operationToken,
          now,
        });
        console.error("[billing] last-chance auto-recharge is uncertain", {
          phId: number.phId,
          organizationId: number.organizationId,
          error:
            rechargeError instanceof Error
              ? rechargeError.message
              : String(rechargeError),
        });
        return { phId: number.phId, status: "retry" as const };
      }
      return { phId: number.phId, status: "unfunded" as const };
    }

    const suspended = await suspendClaimedNumber(number, now, operationToken);
    if (!suspended) {
      return { phId: number.phId, status: "claim_lost" as const };
    }
    try {
      await triggerAutoRecharge(number.organizationId, "number_renewal", {
        requiredPaidMicros,
        contextKey: reservationKey,
      });
    } catch (rechargeError) {
      console.error("[billing] number renewal auto-recharge failed", {
        phId: number.phId,
        organizationId: number.organizationId,
        error:
          rechargeError instanceof Error
            ? rechargeError.message
            : String(rechargeError),
      });
    }
    return { phId: number.phId, status: "suspended" as const };
  }
}

async function suspendClaimedNumber(
  number: PhoneNumberRow,
  now: Date,
  operationToken: string,
) {
  const suspendedAt = number.billingSuspendedAt ?? now;
  // Make the database denial immediate even if a provider is temporarily
  // unreachable. Runtime configuration also checks this status.
  const suspended = await numberBillingOperationStore.suspendClaimed({
    number,
    token: operationToken,
    now,
    scheduledReleaseAt:
      number.scheduledReleaseAt ??
      new Date(suspendedAt.getTime() + RELEASE_GRACE_MS),
  });
  if (!suspended) return false;
  if (!number.agentId) return true;
  try {
    await setProviderBinding(false, number);
    await setLiveKitBinding(false, number);
    await phoneRepository.linkAgent(
      number.phId,
      number.organizationId,
      null,
      number.agentId,
    );
  } catch (error) {
    console.error("[billing] failed to fully unlink suspended number", {
      phId: number.phId,
      organizationId: number.organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
}

async function releaseExpiredSuspensions(now: Date) {
  const releaseService = new NumberReleaseService({
    tryLastChanceRenewal: async (
      number,
      releaseNow,
      operationToken,
    ): Promise<LastChanceRenewalResult> => {
      const result = await renewClaimedNumber(
        number,
        releaseNow,
        operationToken,
        "last_chance",
      );
      return { status: result.status } as LastChanceRenewalResult;
    },
    deleteClaimedNumber: (organizationId, phId, operationToken, _releaseNow) =>
      deleteNumber(organizationId, phId, {
        releaseClaim: { operationToken, now: new Date() },
      }),
    onError: (error, number) => {
      console.error("[billing] failed to release expired phone number", {
        phId: number.phId,
        organizationId: number.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });
  return releaseService.releaseExpiredSuspensions(now);
}

async function sendPendingLegacyNumberNotices(now: Date) {
  const numbers = await prisma.phoneNumber.findMany({
    where: {
      lastBilledAt: null,
      billingNoticeSentAt: null,
    },
    include: {
      organization: {
        select: {
          members: {
            where: { role: { in: ["owner", "admin"] } },
            select: { user: { select: { email: true, name: true } } },
          },
        },
      },
    },
  });
  const sent: string[] = [];
  for (const number of numbers) {
    const chargeDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    try {
      const currentPrice = await currentProviderNumberCost(number, now);
      const providerCostMicros = currentPrice.providerCostMicros;
      const rentalPriceMicros =
        calculateNumberRentalPriceMicros(providerCostMicros);
      if (number.organization.members.length === 0) {
        throw new Error("Organization has no owner or admin billing recipient");
      }
      await Promise.all(
        number.organization.members.map(({ user }) =>
          sendNumberBillingNotice({
            email: user.email,
            fullName: user.name,
            phoneNumber: number.number,
            chargeDate,
            priceUsd: `$${formatMicrosAsUsd(rentalPriceMicros)}`,
          }),
        ),
      );
      await prisma.phoneNumber.update({
        where: { phId: number.phId },
        data: {
          billingNoticeSentAt: now,
          nextBillingAt: chargeDate,
          providerMonthlyCostMicros: providerCostMicros,
          rentalPriceMicros,
          billingRateCatalogVersion: getRateCatalog().catalogVersion,
          billingCountryIso: currentPrice.countryIso,
          billingNumberType: currentPrice.numberType,
        },
      });
      sent.push(number.phId);
    } catch (error) {
      console.warn("[billing] failed to send phone renewal notice", {
        phId: number.phId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return sent;
}

async function currentProviderNumberCost(
  number: {
    sid: string;
    number: string;
    provider: TelephonyProvider;
    billingCountryIso: string | null;
    billingNumberType: string | null;
  },
  now: Date,
) {
  if (number.provider === TelephonyProvider.TWILIO) {
    const needsMetadata =
      !number.billingCountryIso || !number.billingNumberType;
    const [owned, lookup] = needsMetadata
      ? await Promise.all([
          twilioClient.incomingPhoneNumbers(number.sid).fetch(),
          number.billingCountryIso
            ? Promise.resolve(null)
            : twilioClient.lookups.v2.phoneNumbers(number.number).fetch(),
        ])
      : [null, null];
    const countryIso = (
      number.billingCountryIso ?? lookup?.countryCode
    )?.toUpperCase();
    const numberType = normalizeNumberType(
      number.billingNumberType ?? owned?.type,
    );
    if (!countryIso || !numberType) {
      throw new Error(
        "Twilio number country/type is unavailable for current pricing",
      );
    }
    const pricing = await twilioClient.pricing.v1.phoneNumbers
      .countries(countryIso)
      .fetch();
    if (pricing.priceUnit?.toUpperCase() !== "USD") {
      throw new Error(
        `Unsupported Twilio number currency: ${pricing.priceUnit}`,
      );
    }
    const price = pricing.phoneNumberPrices?.find(
      (item) => normalizeNumberType(item.numberType) === numberType,
    )?.currentPrice;
    if (!price)
      throw new Error(
        `Twilio has no current ${countryIso}/${numberType} rental price`,
      );
    return {
      providerCostMicros: parseUsdToMicros(price),
      countryIso,
      numberType,
    };
  }

  const [owned, chargesBreakdown] = await Promise.all([
    telnyxClient.phoneNumbers.retrieve(number.sid),
    telnyxClient.chargesBreakdown.retrieve(telnyxChargesBreakdownWindow(now)),
  ]);
  const countryIso = (
    number.billingCountryIso ?? owned.data?.country_iso_alpha2
  )?.toUpperCase();
  const rawType = number.billingNumberType ?? owned.data?.phone_number_type;
  const numberType = normalizeTelnyxNumberType(rawType);
  if (!countryIso || !numberType) {
    throw new Error(
      "Telnyx number country/type is unavailable for current pricing",
    );
  }
  return {
    providerCostMicros: exactTelnyxNumberMrcMicros(
      chargesBreakdown.data,
      number.number,
    ),
    countryIso,
    numberType,
  };
}

function normalizeTelnyxNumberType(value: string | null | undefined) {
  if (value === "tollfree") return "toll_free" as const;
  if (value === "landline" || value === "longcode") return "local" as const;
  if (
    value === "local" ||
    value === "toll_free" ||
    value === "mobile" ||
    value === "national" ||
    value === "shared_cost"
  ) {
    return value;
  }
  return null;
}

function normalizeNumberType(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "tollfree") return "toll_free";
  return normalized || null;
}

async function restorePaidNumberBindings() {
  const numbers = await prisma.phoneNumber.findMany({
    where: {
      billingStatus: PhoneNumberBillingStatus.ACTIVE,
      billingSuspendedAgentId: { not: null },
      agentId: null,
    },
    select: { phId: true, organizationId: true },
    take: 100,
  });
  const restored: string[] = [];
  for (const number of numbers) {
    if (await restoreNumberBinding(number.phId, number.organizationId)) {
      restored.push(number.phId);
    }
  }
  return restored;
}

async function restoreNumberBinding(phId: string, organizationId: string) {
  const number = await prisma.phoneNumber.findFirst({
    where: { phId, organizationId },
    select: { billingSuspendedAgentId: true, billingStatus: true },
  });
  if (
    !number?.billingSuspendedAgentId ||
    number.billingStatus !== PhoneNumberBillingStatus.ACTIVE
  ) {
    return false;
  }
  try {
    await linkAgentToNumber({
      phId,
      organizationId,
      agentId: number.billingSuspendedAgentId,
    });
    await prisma.phoneNumber.update({
      where: { phId },
      data: { billingSuspendedAgentId: null },
    });
    return true;
  } catch (error) {
    console.error("[billing] failed to restore paid number binding", {
      phId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function defaultProviderNumberCost(provider: TelephonyProvider) {
  const entry =
    getRateCatalog().telephony[
      String(provider).toLowerCase() as "twilio" | "telnyx"
    ];
  return BigInt(entry.default.baseNumberRentalMicrosPerThirtyDays);
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function operationLeaseUntil(now = new Date()) {
  return new Date(now.getTime() + NUMBER_BILLING_OPERATION_LEASE_MS);
}
