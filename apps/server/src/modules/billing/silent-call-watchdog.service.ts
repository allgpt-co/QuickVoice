import {
  CallBillingSessionStatus,
  Prisma,
  type CallBillingSession,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import { livekitRoomServiceClient } from "../../config/livekit.js";
import {
  ReservationStateError,
  settleReservation,
} from "./wallet-ledger.service.js";

/**
 * A telephony call whose AI worker never reports usage is still a live,
 * provider-billed SIP leg. Nothing else hangs it up, so without this sweep the
 * leg stays connected until the provider's maximum call duration while the
 * wallet is never charged.
 */
export const FIRST_REPORT_GRACE_MS = 45_000;
/** The worker reports every 10s and stops itself after a 50s reporting gap. */
export const REPORTING_GAP_GRACE_MS = 90_000;
const BATCH_SIZE = 100;

// Same precedence the AI worker uses to derive provider_call_id.
const PROVIDER_CALL_ID_ATTRIBUTES = [
  "sip.twilio.callSid",
  "twilioCallSid",
  "telnyxCallControlId",
] as const;

type RoomParticipant = { attributes?: Record<string, string> };

export type SilentCallWatchdogDependencies = {
  listParticipants: (roomName: string) => Promise<RoomParticipant[]>;
  deleteRoom: (roomName: string) => Promise<unknown>;
};

const defaultDependencies: SilentCallWatchdogDependencies = {
  listParticipants: (roomName) =>
    livekitRoomServiceClient.listParticipants(roomName),
  deleteRoom: (roomName) => livekitRoomServiceClient.deleteRoom(roomName),
};

export function silentSessionWhere(
  now: Date,
): Prisma.CallBillingSessionWhereInput {
  return {
    status: CallBillingSessionStatus.ACTIVE,
    telephonyProvider: { not: null },
    OR: [
      {
        lastUsageSequence: 0,
        createdAt: { lte: new Date(now.getTime() - FIRST_REPORT_GRACE_MS) },
      },
      {
        lastUsageSequence: { gt: 0 },
        updatedAt: { lte: new Date(now.getTime() - REPORTING_GAP_GRACE_MS) },
      },
    ],
  };
}

export function providerCallIdFromParticipants(
  participants: RoomParticipant[],
): string | null {
  for (const key of PROVIDER_CALL_ID_ATTRIBUTES) {
    for (const participant of participants) {
      const value = participant.attributes?.[key]?.trim();
      if (value) return value;
    }
  }
  return null;
}

function isRoomNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return candidate.status === 404 || candidate.code === "not_found";
}

/**
 * Hangs up the provider leg of a silent call. Returns false when the room could
 * not be torn down, in which case billing is left untouched so the next sweep
 * retries instead of ending a call that is still connected.
 */
export async function hangUpSilentCall(
  roomName: string,
  dependencies: SilentCallWatchdogDependencies,
): Promise<{ hungUp: boolean; providerCallId: string | null }> {
  let providerCallId: string | null = null;
  try {
    providerCallId = providerCallIdFromParticipants(
      await dependencies.listParticipants(roomName),
    );
  } catch (error) {
    if (!isRoomNotFound(error)) {
      console.warn("[BILLING_WATCHDOG] could not list room participants", {
        roomName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  try {
    await dependencies.deleteRoom(roomName);
  } catch (error) {
    if (!isRoomNotFound(error)) {
      console.error("[BILLING_WATCHDOG] could not delete silent call room", {
        roomName,
        error: error instanceof Error ? error.message : String(error),
      });
      return { hungUp: false, providerCallId };
    }
  }
  return { hungUp: true, providerCallId };
}

async function endSilentSession(
  session: CallBillingSession,
  providerCallId: string | null,
  now: Date,
) {
  let settledAmountMicros = 0n;
  let debtIncurredMicros = 0n;
  if (session.activeReservationId) {
    const reservation = await prisma.billingReservation.findUnique({
      where: { billingReservationId: session.activeReservationId },
    });
    if (reservation) {
      try {
        // Keep the whole hold until the provider-final reconciliation replaces
        // it with the real telephony charge (refunding any excess).
        const settlement = await settleReservation({
          organizationId: session.organizationId,
          reservationId: reservation.billingReservationId,
          actualAmountMicros: reservation.amountMicros,
          idempotencyKey: `silent-call:${reservation.billingReservationId}`,
          description: "Hold retained for a call that stopped reporting usage",
          metadata: {
            maintenanceTail: session.lastUsageSequence > 0,
            silentCall: true,
            callId: session.callId,
          },
        });
        settledAmountMicros = settlement.reservation.settledAmountMicros;
        debtIncurredMicros = settlement.reservation.debtIncurredMicros;
      } catch (error) {
        // A late usage snapshot won the race; it owns the session now.
        if (error instanceof ReservationStateError) return false;
        throw error;
      }
    }
  }

  const updated = await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: session.callBillingSessionId,
      status: CallBillingSessionStatus.ACTIVE,
      activeReservationId: session.activeReservationId,
    },
    data: {
      // Every session here has a telephony provider, so the provider's posted
      // price is always the final word.
      status: CallBillingSessionStatus.RECONCILING,
      activeReservationId: null,
      totalSettledMicros: { increment: settledAmountMicros },
      debtIncurredMicros: { increment: debtIncurredMicros },
      // A call that never reported has no measured AI/platform usage, so the
      // hold is not a usage tail: reconciliation must be able to refund it
      // down to the provider's charge.
      unreportedTailMicros: {
        increment: session.lastUsageSequence > 0 ? settledAmountMicros : 0n,
      },
      providerCallId: session.providerCallId ?? providerCallId,
      endedAt: now,
      reconciliationNextAt: now,
      reconciliationLastError:
        session.lastUsageSequence > 0
          ? "AI worker stopped reporting usage; call terminated by billing watchdog"
          : "AI worker never reported usage; call terminated by billing watchdog",
    } as Prisma.CallBillingSessionUpdateManyMutationInput,
  });
  return updated.count > 0;
}

/** Hangs up and bills telephony calls whose AI worker is not reporting usage. */
export async function terminateSilentCalls(
  now = new Date(),
  dependencies: SilentCallWatchdogDependencies = defaultDependencies,
) {
  if (!isHostedBilling) return { skipped: true, examined: 0, terminated: 0 };

  const sessions = await prisma.callBillingSession.findMany({
    where: silentSessionWhere(now),
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  let terminated = 0;
  for (const session of sessions) {
    const hangUpResult = session.roomName
      ? await hangUpSilentCall(session.roomName, dependencies)
      : { hungUp: true, providerCallId: null };
    if (!hangUpResult.hungUp) continue;
    if (await endSilentSession(session, hangUpResult.providerCallId, now)) {
      terminated += 1;
      console.warn("[BILLING_WATCHDOG] terminated silent call", {
        callId: session.callId,
        organizationId: session.organizationId,
        roomName: session.roomName,
        lastUsageSequence: session.lastUsageSequence,
      });
    }
  }
  return { skipped: false, examined: sessions.length, terminated };
}

let watchdogTimer: NodeJS.Timeout | null = null;

/**
 * Runs the sweep in-process as well as from Inngest, so hanging up unbilled
 * calls never depends on the external scheduler being reachable. The sweep is
 * idempotent, so overlapping runs across replicas are safe.
 */
export function startSilentCallWatchdog(
  intervalMs = Number(process.env.SILENT_CALL_WATCHDOG_INTERVAL_MS ?? 15_000),
) {
  if (!isHostedBilling || watchdogTimer || !(intervalMs > 0)) return;
  let running = false;
  watchdogTimer = setInterval(() => {
    if (running) return;
    running = true;
    terminateSilentCalls()
      .catch((error) =>
        console.error("[BILLING_WATCHDOG] sweep failed", error),
      )
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  watchdogTimer.unref();
}

export function stopSilentCallWatchdog() {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = null;
}
