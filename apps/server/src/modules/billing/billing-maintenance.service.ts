import {
  BillingReservationStatus,
  CallBillingSessionStatus,
  Prisma,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import {
  releaseReservation,
  ReservationStateError,
  settleReservation,
} from "./wallet-ledger.service.js";

const BATCH_SIZE = 200;

/** Releases abandoned wallet holds and makes an associated live call fail closed. */
export async function releaseExpiredBillingReservations(now = new Date()) {
  if (!isHostedBilling) return { skipped: true, released: 0 };

  await repairSettledTailProjections(now);

  const expired = await prisma.billingReservation.findMany({
    where: {
      status: BillingReservationStatus.ACTIVE,
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: "asc" },
    take: BATCH_SIZE,
  });
  let released = 0;
  let conservativelySettled = 0;
  for (const reservation of expired) {
    const callSession = await prisma.callBillingSession.findFirst({
      where: {
        activeReservationId: reservation.billingReservationId,
        status: CallBillingSessionStatus.ACTIVE,
      },
    });
    if (callSession && callSession.lastUsageSequence > 0) {
      try {
        const settlement = await settleReservation({
          organizationId: reservation.organizationId,
          reservationId: reservation.billingReservationId,
          actualAmountMicros: reservation.amountMicros,
          idempotencyKey: `expired-tail:${reservation.billingReservationId}`,
          description: "Conservative charge for an unreported live-call tail",
          metadata: {
            maintenanceTail: true,
            callId: callSession.callId,
            expiredAt: reservation.expiresAt?.toISOString() ?? null,
          },
        });
        await applySettledTailProjection(
          callSession.callBillingSessionId,
          reservation.billingReservationId,
          settlement.reservation.settledAmountMicros,
          settlement.reservation.debtIncurredMicros,
          callSession.telephonyProvider !== null,
          now,
        );
        conservativelySettled += 1;
      } catch (error) {
        if (!(error instanceof ReservationStateError)) throw error;
      }
      continue;
    }

    try {
      await releaseReservation({
        organizationId: reservation.organizationId,
        reservationId: reservation.billingReservationId,
        idempotencyKey: `expired:${reservation.billingReservationId}`,
        description: "Release expired billing authorization",
        metadata: { expiredAt: reservation.expiresAt?.toISOString() ?? null },
      });
      released += 1;
    } catch (error) {
      // Settlement can win the race after the initial read. That is a valid
      // terminal state, not a failed sweep.
      if (!(error instanceof ReservationStateError)) throw error;
    }

    await prisma.callBillingSession.updateMany({
      where: {
        activeReservationId: reservation.billingReservationId,
        status: CallBillingSessionStatus.ACTIVE,
      },
      data: {
        status: CallBillingSessionStatus.ENDED,
        activeReservationId: null,
        endedAt: now,
        reconciliationLastError:
          "Unused call admission expired before the first usage snapshot",
      },
    });
  }
  await repairCallLogBillingCosts();
  return {
    skipped: false,
    released,
    conservativelySettled,
    examined: expired.length,
  };
}

async function repairSettledTailProjections(now: Date) {
  const sessions = await prisma.callBillingSession.findMany({
    where: {
      status: { in: [CallBillingSessionStatus.ACTIVE, CallBillingSessionStatus.DEBT] },
      activeReservationId: { not: null },
    },
    take: BATCH_SIZE,
  });
  for (const session of sessions) {
    const reservation = await prisma.billingReservation.findUnique({
      where: { billingReservationId: session.activeReservationId! },
    });
    if (reservation?.status !== BillingReservationStatus.SETTLED) continue;
    const transaction = await prisma.billingTransaction.findFirst({
      where: {
        referenceType: "billing_reservation",
        referenceId: reservation.billingReservationId,
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const metadata = transaction?.metadata;
    if (
      !metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata) ||
      metadata.maintenanceTail !== true
    ) {
      continue;
    }
    await applySettledTailProjection(
      session.callBillingSessionId,
      reservation.billingReservationId,
      reservation.settledAmountMicros,
      reservation.debtIncurredMicros,
      session.telephonyProvider !== null,
      now,
    );
  }
}

async function applySettledTailProjection(
  callBillingSessionId: string,
  reservationId: string,
  settledAmountMicros: bigint,
  debtIncurredMicros: bigint,
  hasProvider: boolean,
  now: Date,
) {
  await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId,
      activeReservationId: reservationId,
      status: { in: [CallBillingSessionStatus.ACTIVE, CallBillingSessionStatus.DEBT] },
    },
    data: {
      status: hasProvider
        ? CallBillingSessionStatus.RECONCILING
        : debtIncurredMicros > 0n
          ? CallBillingSessionStatus.DEBT
          : CallBillingSessionStatus.SETTLED,
      activeReservationId: null,
      totalSettledMicros: { increment: settledAmountMicros },
      debtIncurredMicros: { increment: debtIncurredMicros },
      unreportedTailMicros: { increment: settledAmountMicros },
      endedAt: now,
      reconciliationNextAt: hasProvider ? now : null,
      reconciliationLastError:
        "Reporter authorization expired; conservatively settled the reserved tail",
    } as Prisma.CallBillingSessionUpdateManyMutationInput,
  });
}

export async function repairCallLogBillingCosts() {
  const sessions = await prisma.callBillingSession.findMany({
    where: {
      endedAt: { not: null },
      OR: [
        { telephonyProvider: null },
        { telephonyFinalMicros: { not: null } },
      ],
    },
    orderBy: { endedAt: "asc" },
    take: BATCH_SIZE,
  });
  let repaired = 0;
  for (const session of sessions) {
    const cents = Number(
      (session.totalSettledMicros + 9_999n) / 10_000n >
        BigInt(Number.MAX_SAFE_INTEGER)
        ? BigInt(Number.MAX_SAFE_INTEGER)
        : (session.totalSettledMicros + 9_999n) / 10_000n,
    );
    const updated = await prisma.callLog.updateMany({
      where: { callId: session.callId, organizationId: session.organizationId },
      data: { callCostCents: cents },
    });
    repaired += updated.count;
  }
  return repaired;
}
