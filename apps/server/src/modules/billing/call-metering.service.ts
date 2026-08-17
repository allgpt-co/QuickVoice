import {
  BillingTransactionType,
  CallBillingSessionStatus,
  Prisma,
  TelephonyProvider,
  type BillingTransaction,
  type CallBillingSession,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import {
  InsufficientCreditError,
  ReservationStateError,
  debitUsageAdjustment,
  getBillingSummary,
  releaseReservation,
  reserveUsageCredit,
  settleReservation,
  type BillingSummary,
} from "./wallet-ledger.service.js";
import {
  getRateCatalog,
  parseRateCatalogSnapshot,
  type RateCatalog,
} from "./rate-catalog.service.js";
import {
  estimateConfiguredMinuteMicros,
  rateCumulativeCallUsage,
} from "./call-pricing.service.js";
import type { CallUsageSnapshotInput } from "./billing.schema.js";

const RESERVATION_TTL_MS = 2 * 60 * 1_000;
const SNAPSHOT_CLAIM_STALE_MS = 30_000;
const SNAPSHOT_CLAIM_WAIT_ATTEMPTS = 50;
const SNAPSHOT_CLAIM_WAIT_MS = 100;
const USAGE_CHECKPOINT_VERSION = 1;
const WALLET_BILLING_MODE = "WALLET" as const;
const LEGACY_BILLING_MODE = "LEGACY_SUBSCRIPTION" as const;

type UsageCheckpoint = {
  version: typeof USAGE_CHECKPOINT_VERSION;
  callId: string;
  sequence: number;
  final: boolean;
  connectedSeconds: number;
  connectedMilliseconds: string;
  aiCostMicros: string;
  platformCostMicros: string;
  telephonyEstimatedMicros: string;
  targetTotalSettledMicros: string;
  priorDebtIncurredMicros: string;
  nextReserveMicros: string;
  modelUsage: CallUsageSnapshotInput["modelUsage"];
  sessionId: string | null;
  roomName: string;
  agentId: string | null;
  userId: string | null;
  telephonyProvider: TelephonyProvider | null;
  providerCallId: string | null;
  endedAt: string | null;
};

type CompletedUsageCheckpoint = {
  account: BillingSummary;
  stopReason: string | null;
  status: CallBillingSessionStatus;
};

type AdmissionArgs = {
  organizationId: string;
  callId: string;
  roomName?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  userId?: string | null;
  telephonyProvider?: TelephonyProvider | null;
  direction?: "inbound" | "outbound";
};

export type CallAdmission = {
  action: "continue" | "stop";
  reason?: string;
  reserveMicros?: bigint;
  callBillingSessionId?: string;
};

export async function authorizeCallBilling(
  args: AdmissionArgs,
): Promise<CallAdmission> {
  if (!isHostedBilling) return { action: "continue", reason: "self_hosted" };
  const existing = await prisma.callBillingSession.findUnique({
    where: { callId: args.callId },
  });
  if (existing) {
    return sessionBillingMode(existing) === LEGACY_BILLING_MODE
      ? authorizeLegacyCall(args, existing)
      : authorizeWalletCall(args);
  }
  if (await hasActiveLegacySubscription(args.organizationId)) {
    return authorizeLegacyCall(args, existing);
  }
  return authorizeWalletCall(args);
}

async function authorizeLegacyCall(
  args: AdmissionArgs,
  existing?: CallBillingSession | null,
): Promise<CallAdmission> {
  if (existing) {
    if (existing.organizationId !== args.organizationId) {
      return { action: "stop", reason: "call_identity_conflict" };
    }
    if (existing.status === CallBillingSessionStatus.ACTIVE) {
      return {
        action: "continue",
        reason: "legacy_subscription",
        callBillingSessionId: existing.callBillingSessionId,
      };
    }
    if (existing.status !== CallBillingSessionStatus.ENDED) {
      return {
        action: "stop",
        reason: "call_already_ended",
        callBillingSessionId: existing.callBillingSessionId,
      };
    }
    await prisma.callBillingSession.updateMany({
      where: {
        callBillingSessionId: existing.callBillingSessionId,
        status: CallBillingSessionStatus.ENDED,
      },
      data: {
        status: CallBillingSessionStatus.ACTIVE,
        admissionGeneration: { increment: 1 },
        sessionId: args.sessionId ?? null,
        roomName: args.roomName ?? null,
        agentId: args.agentId ?? existing.agentId,
        userId: args.userId ?? existing.userId,
        telephonyProvider: args.telephonyProvider ?? existing.telephonyProvider,
        lastUsageSequence: 0,
        lastModelUsage: Prisma.DbNull,
        connectedSeconds: 0,
        connectedMilliseconds: 0n,
        unreportedTailMicros: 0n,
        startedAt: new Date(),
        endedAt: null,
      },
    });
    return {
      action: "continue",
      reason: "legacy_subscription",
      callBillingSessionId: existing.callBillingSessionId,
    };
  }

  const [pricing, account] = await Promise.all([
    admissionPricing(args),
    getBillingSummary(args.organizationId),
  ]);
  try {
    const created = await prisma.callBillingSession.create({
      data: {
        callId: args.callId,
        billingAccountId: account.billingAccountId,
        organizationId: args.organizationId,
        status: CallBillingSessionStatus.ACTIVE,
        billingMode: LEGACY_BILLING_MODE,
        rateCatalogVersion: pricing.catalog.catalogVersion,
        rateSnapshot: pricing.rateSnapshot,
        sessionId: args.sessionId ?? null,
        roomName: args.roomName ?? null,
        agentId: args.agentId ?? null,
        userId: args.userId ?? null,
        telephonyProvider: args.telephonyProvider ?? null,
        startedAt: new Date(),
      } as unknown as Prisma.CallBillingSessionUncheckedCreateInput,
    });
    return {
      action: "continue",
      reason: "legacy_subscription",
      callBillingSessionId: created.callBillingSessionId,
    };
  } catch (error) {
    const raced = await prisma.callBillingSession.findUnique({
      where: { callId: args.callId },
    });
    if (
      raced?.organizationId === args.organizationId &&
      sessionBillingMode(raced) === LEGACY_BILLING_MODE
    ) {
      return {
        action: "continue",
        reason: "legacy_subscription",
        callBillingSessionId: raced.callBillingSessionId,
      };
    }
    throw error;
  }
}

async function authorizeWalletCall(args: AdmissionArgs): Promise<CallAdmission> {
  const existing = await prisma.callBillingSession.findUnique({
    where: { callId: args.callId },
  });
  if (existing) {
    if (existing.organizationId !== args.organizationId) {
      return { action: "stop", reason: "call_identity_conflict" };
    }
    if (sessionBillingMode(existing) !== WALLET_BILLING_MODE) {
      return { action: "stop", reason: "call_billing_mode_conflict" };
    }
    if (existing.status === CallBillingSessionStatus.ACTIVE) {
      return {
        action: "continue",
        callBillingSessionId: existing.callBillingSessionId,
      };
    }
    if (existing.status === CallBillingSessionStatus.ENDED) {
      return reauthorizeCanceledAdmission(existing, args);
    }
    return {
      action: "stop",
      reason:
        existing.status === CallBillingSessionStatus.DEBT
          ? "outstanding_debt"
          : "call_already_ended",
      callBillingSessionId: existing.callBillingSessionId,
    };
  }

  const pricing = await admissionPricing(args);
  let reservation;
  try {
    reservation = await reserveUsageCredit({
      organizationId: args.organizationId,
      amountMicros: pricing.reserveMicros,
      idempotencyKey: `call:${args.callId}:reserve:initial:g1`,
      referenceType: "call",
      referenceId: args.callId,
      description: "Initial 60-second call credit reserve",
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      metadata: {
        roomName: args.roomName ?? null,
        rateCatalogVersion: pricing.catalog.catalogVersion,
      },
    });
  } catch (error) {
    if (error instanceof InsufficientCreditError) {
      requestAutoRecharge(args.organizationId);
      return {
        action: "stop",
        reason: "insufficient_credit",
        reserveMicros: pricing.reserveMicros,
      };
    }
    throw error;
  }

  try {
    const session = await prisma.callBillingSession.create({
      data: {
        callId: args.callId,
        billingAccountId: reservation.account.billingAccountId,
        organizationId: args.organizationId,
        status: CallBillingSessionStatus.ACTIVE,
        rateCatalogVersion: pricing.catalog.catalogVersion,
        rateSnapshot: pricing.rateSnapshot,
        admissionGeneration: 1,
        activeReservationId: reservation.reservation.billingReservationId,
        sessionId: args.sessionId ?? null,
        roomName: args.roomName ?? null,
        agentId: args.agentId ?? null,
        userId: args.userId ?? null,
        telephonyProvider: args.telephonyProvider ?? null,
        startedAt: new Date(),
      },
    });
    return {
      action: "continue",
      reserveMicros: pricing.reserveMicros,
      callBillingSessionId: session.callBillingSessionId,
    };
  } catch (error) {
    const raced = await prisma.callBillingSession.findUnique({
      where: { callId: args.callId },
    });
    if (
      raced?.organizationId === args.organizationId &&
      raced.activeReservationId ===
        reservation.reservation.billingReservationId
    ) {
      return {
        action: "continue",
        reserveMicros: pricing.reserveMicros,
        callBillingSessionId: raced.callBillingSessionId,
      };
    }
    await releaseReservation({
      organizationId: args.organizationId,
      reservationId: reservation.reservation.billingReservationId,
      idempotencyKey: `call:${args.callId}:admission-failed:g1`,
      description: "Release failed call admission reserve",
    }).catch(() => undefined);
    throw error;
  }
}

async function reauthorizeCanceledAdmission(
  existing: CallBillingSession,
  args: AdmissionArgs,
): Promise<CallAdmission> {
  const pricing = await admissionPricing(args);
  const generation = existing.admissionGeneration + 1;
  let reservation;
  try {
    reservation = await reserveUsageCredit({
      organizationId: args.organizationId,
      amountMicros: pricing.reserveMicros,
      idempotencyKey: `call:${args.callId}:reserve:initial:g${generation}`,
      referenceType: "call",
      referenceId: args.callId,
      description: "Retry 60-second call credit reserve",
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      metadata: { generation, roomName: args.roomName ?? null },
    });
  } catch (error) {
    if (error instanceof InsufficientCreditError) {
      requestAutoRecharge(args.organizationId);
      return {
        action: "stop",
        reason: "insufficient_credit",
        reserveMicros: pricing.reserveMicros,
      };
    }
    throw error;
  }

  const updated = await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: existing.callBillingSessionId,
      status: CallBillingSessionStatus.ENDED,
      admissionGeneration: existing.admissionGeneration,
    },
    data: {
      status: CallBillingSessionStatus.ACTIVE,
      admissionGeneration: generation,
      rateCatalogVersion: pricing.catalog.catalogVersion,
      rateSnapshot: pricing.rateSnapshot,
      activeReservationId: reservation.reservation.billingReservationId,
      sessionId: args.sessionId ?? null,
      roomName: args.roomName ?? null,
      agentId: args.agentId ?? existing.agentId,
      userId: args.userId ?? existing.userId,
      telephonyProvider: args.telephonyProvider ?? existing.telephonyProvider,
      lastUsageSequence: 0,
      processingUsageSequence: null,
      processingUsageStartedAt: null,
      lastModelUsage: Prisma.DbNull,
      connectedSeconds: 0,
      connectedMilliseconds: 0n,
      aiCostMicros: 0n,
      platformCostMicros: 0n,
      telephonyEstimatedMicros: 0n,
      telephonyFinalMicros: null,
      totalSettledMicros: 0n,
      debtIncurredMicros: 0n,
      unreportedTailMicros: 0n,
      providerCallId: null,
      startedAt: new Date(),
      endedAt: null,
      reconciledAt: null,
    },
  });
  const latest = await prisma.callBillingSession.findUniqueOrThrow({
    where: { callId: args.callId },
  });
  if (
    updated.count === 0 &&
    latest.activeReservationId !== reservation.reservation.billingReservationId
  ) {
    await releaseReservation({
      organizationId: args.organizationId,
      reservationId: reservation.reservation.billingReservationId,
      idempotencyKey: `call:${args.callId}:retry-raced:g${generation}`,
      description: "Release raced retry admission reserve",
    }).catch(() => undefined);
  }
  return latest.status === CallBillingSessionStatus.ACTIVE
    ? {
        action: "continue",
        reserveMicros: pricing.reserveMicros,
        callBillingSessionId: latest.callBillingSessionId,
      }
    : { action: "stop", reason: "call_admission_conflict" };
}

async function admissionPricing(args: AdmissionArgs) {
  const configuration = args.agentId
    ? await prisma.agentConfiguration.findUnique({
        where: { agentId: args.agentId },
        select: { sttModel: true, llmModel: true, ttsModel: true },
      })
    : null;
  const catalog = getRateCatalog();
  const reserveMicros = estimateConfiguredMinuteMicros({
    sttModel: configuration?.sttModel,
    llmModel: configuration?.llmModel,
    ttsModel: configuration?.ttsModel,
    telephonyProvider: args.telephonyProvider,
    direction: args.direction,
  });
  return {
    catalog,
    reserveMicros,
    rateSnapshot: {
      catalogVersion: catalog.catalogVersion,
      // Persist the complete immutable price book so calls remain reproducible
      // across a deploy that changes the current catalog.
      rateCatalog: catalog,
      sttModel: configuration?.sttModel ?? null,
      llmModel: configuration?.llmModel ?? null,
      ttsModel: configuration?.ttsModel ?? null,
      direction: args.direction ?? null,
      initialReserveMicros: reserveMicros.toString(),
    },
  };
}

export async function cancelCallBillingAdmission(args: {
  organizationId: string;
  callId: string;
  reason: string;
}) {
  if (!isHostedBilling) return;
  const session = await prisma.callBillingSession.findFirst({
    where: { callId: args.callId, organizationId: args.organizationId },
  });
  if (session && sessionBillingMode(session) === LEGACY_BILLING_MODE) {
    await prisma.callBillingSession.updateMany({
      where: {
        callBillingSessionId: session.callBillingSessionId,
        status: CallBillingSessionStatus.ACTIVE,
      },
      data: { status: CallBillingSessionStatus.ENDED, endedAt: new Date() },
    });
    return;
  }
  if (!session?.activeReservationId) return;
  await releaseReservation({
    organizationId: args.organizationId,
    reservationId: session.activeReservationId,
    idempotencyKey: `call:${args.callId}:cancel-admission:g${session.admissionGeneration}`,
    description: "Release call reserve before connection",
    metadata: { reason: args.reason },
  });
  await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: session.callBillingSessionId,
      activeReservationId: session.activeReservationId,
    },
    data: {
      status: CallBillingSessionStatus.ENDED,
      activeReservationId: null,
      endedAt: new Date(),
    },
  });
}

export async function applyCallUsageSnapshot(input: CallUsageSnapshotInput) {
  if (!isHostedBilling) {
    return {
      action: "continue" as const,
      reason: "self_hosted",
      chargedMicros: 0n,
    };
  }
  const provider = input.telephonyProvider
    ? TelephonyProvider[input.telephonyProvider]
    : null;
  const direction = input.roomName.startsWith("outbound_")
    ? ("outbound" as const)
    : ("inbound" as const);

  let session = await prisma.callBillingSession.findUnique({
    where: { callId: input.callId },
  });
  if (!session) {
    const admission = await authorizeCallBilling({
      organizationId: input.organizationId,
      callId: input.callId,
      roomName: input.roomName,
      sessionId: input.sessionId,
      agentId: input.agentId,
      userId: input.userId,
      telephonyProvider: provider,
      direction,
    });
    if (admission.action === "stop") {
      if (provider) {
        await persistDeniedProviderSession({
          input,
          provider,
          direction,
          reason: admission.reason ?? "provider_call_denied",
        });
      }
      return { ...admission, chargedMicros: 0n };
    }
    session = await prisma.callBillingSession.findUniqueOrThrow({
      where: { callId: input.callId },
    });
  }
  if (session.organizationId !== input.organizationId) {
    return {
      action: "stop" as const,
      reason: "call_identity_conflict",
      chargedMicros: 0n,
    };
  }
  if (sessionBillingMode(session) === LEGACY_BILLING_MODE) {
    return applyLegacyCallUsageSnapshot(session, input, provider);
  }
  if (
    input.providerCallId &&
    (await providerCallIdBelongsToAnotherCall(
      provider ?? session.telephonyProvider,
      input.providerCallId,
      input.callId,
    ))
  ) {
    return {
      action: "stop" as const,
      reason: "provider_call_identity_conflict",
      chargedMicros: 0n,
    };
  }

  // Wallet settlement and the session projection intentionally live in
  // separate serializable operations. If the process died between them, the
  // append-only settlement transaction contains the exact cumulative usage
  // checkpoint needed to finish the projection without charging twice.
  session = await recoverPendingCallUsageCheckpoint(session);
  if (
    session.status === CallBillingSessionStatus.ENDED ||
    session.status === CallBillingSessionStatus.SETTLED ||
    session.status === CallBillingSessionStatus.RECONCILING
  ) {
    return {
      action: "stop" as const,
      reason: "call_already_ended",
      chargedMicros: 0n,
    };
  }

  const claim = await claimSnapshot(input);
  if (claim === "duplicate") {
    const latest = await prisma.callBillingSession.findUniqueOrThrow({
      where: { callId: input.callId },
    });
    await syncCallLogBillingCost(latest);
    return {
      action:
        latest.status === CallBillingSessionStatus.DEBT
          ? ("stop" as const)
          : ("continue" as const),
      reason:
        latest.status === CallBillingSessionStatus.DEBT
          ? "outstanding_debt"
          : "duplicate_snapshot",
      chargedMicros: 0n,
      availableMicros: null,
    };
  }

  try {
    session = await prisma.callBillingSession.findUniqueOrThrow({
      where: { callId: input.callId },
    });
    const catalog = rateCatalogForSession(session);
    const rated = rateCumulativeCallUsage({
      connectedSeconds: input.connectedSeconds,
      modelUsage: input.modelUsage,
      telephonyProvider: provider ?? session.telephonyProvider,
      direction,
      rateCatalog: catalog,
      configuredModels: snapshotModels(session),
    });
    const aiCostMicros = maxBigInt(rated.aiCostMicros, session.aiCostMicros);
    const platformCostMicros = maxBigInt(
      rated.platformCostMicros,
      session.platformCostMicros,
    );
    const telephonyEstimatedMicros = maxBigInt(
      rated.telephonyEstimatedMicros,
      session.telephonyEstimatedMicros,
    );
    const priorTotal =
      session.aiCostMicros +
      session.platformCostMicros +
      session.telephonyEstimatedMicros;
    const cumulativeTotal =
      aiCostMicros + platformCostMicros + telephonyEstimatedMicros;
    const deltaMicros = cumulativeTotal - priorTotal;

    const nextReserveMicros = calculateRollingReserveMicros({
      configuredReserveMicros: snapshotReserveMicros(session),
      priorConnectedMilliseconds: session.connectedMilliseconds,
      connectedMilliseconds: rated.connectedMilliseconds,
      priorAiAndPlatformMicros:
        session.aiCostMicros + session.platformCostMicros,
      aiAndPlatformMicros: aiCostMicros + platformCostMicros,
    });
    const checkpoint: UsageCheckpoint = {
      version: USAGE_CHECKPOINT_VERSION,
      callId: input.callId,
      sequence: input.sequence,
      final: input.final,
      connectedSeconds: Math.max(0, Math.ceil(input.connectedSeconds)),
      connectedMilliseconds: rated.connectedMilliseconds.toString(),
      aiCostMicros: aiCostMicros.toString(),
      platformCostMicros: platformCostMicros.toString(),
      telephonyEstimatedMicros: telephonyEstimatedMicros.toString(),
      targetTotalSettledMicros: (
        session.totalSettledMicros + deltaMicros
      ).toString(),
      priorDebtIncurredMicros: session.debtIncurredMicros.toString(),
      nextReserveMicros: nextReserveMicros.toString(),
      modelUsage: input.modelUsage,
      sessionId: input.sessionId ?? session.sessionId,
      roomName: input.roomName,
      agentId: input.agentId ?? session.agentId,
      userId: input.userId ?? session.userId,
      telephonyProvider: provider ?? session.telephonyProvider,
      providerCallId: input.providerCallId ?? session.providerCallId,
      endedAt: input.final ? new Date().toISOString() : null,
    };

    let account: BillingSummary;
    let transaction: BillingTransaction | null = null;
    if (session.activeReservationId) {
      const settlement = await settleReservation({
        organizationId: input.organizationId,
        reservationId: session.activeReservationId,
        actualAmountMicros: deltaMicros,
        idempotencyKey: `call:${input.callId}:settle:${input.sequence}`,
        description: "10-second cumulative call usage settlement",
        metadata: {
          callId: input.callId,
          sequence: input.sequence,
          final: input.final,
          connectedMilliseconds: rated.connectedMilliseconds.toString(),
          usageCheckpoint: checkpoint,
        },
      });
      account = settlement.account;
      transaction = settlement.transaction;
    } else if (deltaMicros > 0n) {
      // A depletion response intentionally has no next reserve. The shutdown
      // tail still arrives as a final cumulative snapshot and must be charged,
      // with any unavailable amount recorded as debt.
      const adjustment = await debitUsageAdjustment({
        organizationId: input.organizationId,
        amountMicros: deltaMicros,
        idempotencyKey: `call:${input.callId}:tail:${input.sequence}`,
        referenceType: "call",
        referenceId: input.callId,
        description: "Call usage after final rolling reserve",
        metadata: {
          sequence: input.sequence,
          final: input.final,
          usageCheckpoint: checkpoint,
        },
      });
      account = adjustment.account;
      transaction = adjustment.transaction;
    } else {
      account = await getBillingSummary(input.organizationId);
    }

    const completed = await completeUsageCheckpoint({
      session,
      checkpoint,
      settlementDebtDeltaMicros: positive(
        transaction?.debtDeltaMicros ?? 0n,
      ),
      account,
    });
    return {
      action: completed.stopReason
        ? ("stop" as const)
        : ("continue" as const),
      reason: completed.stopReason ?? undefined,
      chargedMicros: deltaMicros,
      availableMicros: completed.account.availableUsageMicros,
    };
  } catch (error) {
    await prisma.callBillingSession.updateMany({
      where: {
        callId: input.callId,
        processingUsageSequence: input.sequence,
      },
      data: {
        processingUsageSequence: null,
        processingUsageStartedAt: null,
      },
    });
    throw error;
  }
}

async function persistDeniedProviderSession(args: {
  input: CallUsageSnapshotInput;
  provider: TelephonyProvider;
  direction: "inbound" | "outbound";
  reason: string;
}) {
  const { input, provider } = args;
  const existing = await prisma.callBillingSession.findUnique({
    where: { callId: input.callId },
  });
  if (existing) return existing;

  const [pricing, account] = await Promise.all([
    admissionPricing({
      organizationId: input.organizationId,
      callId: input.callId,
      roomName: input.roomName,
      sessionId: input.sessionId,
      agentId: input.agentId,
      userId: input.userId,
      telephonyProvider: provider,
      direction: args.direction,
    }),
    getBillingSummary(input.organizationId),
  ]);
  const now = new Date();
  try {
    return await prisma.callBillingSession.create({
      data: {
        callId: input.callId,
        billingAccountId: account.billingAccountId,
        organizationId: input.organizationId,
        status: CallBillingSessionStatus.RECONCILING,
        rateCatalogVersion: pricing.catalog.catalogVersion,
        rateSnapshot: pricing.rateSnapshot,
        sessionId: input.sessionId ?? null,
        roomName: input.roomName,
        agentId: input.agentId ?? null,
        userId: input.userId ?? null,
        lastUsageSequence: input.sequence,
        connectedSeconds: Math.max(0, Math.ceil(input.connectedSeconds)),
        connectedMilliseconds: BigInt(
          Math.max(0, Math.ceil(input.connectedSeconds * 1_000)),
        ),
        lastModelUsage: input.modelUsage,
        telephonyProvider: provider,
        providerCallId: input.providerCallId ?? null,
        reconciliationNextAt: now,
        reconciliationLastError: input.providerCallId
          ? `Provider-connected call denied: ${args.reason}`
          : `Provider-connected call denied without provider ID: ${args.reason}`,
        startedAt: now,
        endedAt: now,
      },
    });
  } catch (error) {
    const raced = await prisma.callBillingSession.findUnique({
      where: { callId: input.callId },
    });
    if (raced?.organizationId === input.organizationId) return raced;
    throw error;
  }
}

async function providerCallIdBelongsToAnotherCall(
  provider: TelephonyProvider | null,
  providerCallId: string,
  callId: string,
) {
  if (!provider) return false;
  const existing = await prisma.callBillingSession.findFirst({
    where: {
      telephonyProvider: provider,
      providerCallId,
      callId: { not: callId },
    },
    select: { callBillingSessionId: true },
  });
  return existing !== null;
}

async function applyLegacyCallUsageSnapshot(
  session: CallBillingSession,
  input: CallUsageSnapshotInput,
  provider: TelephonyProvider | null,
) {
  await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: session.callBillingSessionId,
      lastUsageSequence: { lt: input.sequence },
      status: {
        in: [
          CallBillingSessionStatus.ACTIVE,
          CallBillingSessionStatus.ENDED,
        ],
      },
    },
    data: {
      status: input.final
        ? CallBillingSessionStatus.SETTLED
        : CallBillingSessionStatus.ACTIVE,
      lastUsageSequence: input.sequence,
      connectedSeconds: Math.max(0, Math.ceil(input.connectedSeconds)),
      connectedMilliseconds: BigInt(
        Math.max(0, Math.ceil(input.connectedSeconds * 1_000)),
      ),
      lastModelUsage: input.modelUsage,
      sessionId: input.sessionId ?? session.sessionId,
      roomName: input.roomName,
      agentId: input.agentId ?? session.agentId,
      userId: input.userId ?? session.userId,
      telephonyProvider: provider ?? session.telephonyProvider,
      providerCallId: input.providerCallId ?? session.providerCallId,
      ...(input.final ? { endedAt: new Date(), reconciledAt: new Date() } : {}),
    },
  });
  return {
    action: "continue" as const,
    reason: "legacy_subscription",
    chargedMicros: 0n,
    availableMicros: null,
  };
}

async function recoverPendingCallUsageCheckpoint(
  session: CallBillingSession,
): Promise<CallBillingSession> {
  const pending = await findPendingCallUsageCheckpoint(session);
  if (!pending) return session;

  await completeUsageCheckpoint({
    session,
    checkpoint: pending.checkpoint,
    settlementDebtDeltaMicros: positive(pending.transaction.debtDeltaMicros),
    account: await getBillingSummary(session.organizationId),
  });
  return prisma.callBillingSession.findUniqueOrThrow({
    where: { callBillingSessionId: session.callBillingSessionId },
  });
}

async function findPendingCallUsageCheckpoint(session: CallBillingSession) {
  const reservations = await prisma.billingReservation.findMany({
    where: {
      organizationId: session.organizationId,
      referenceType: "call",
      referenceId: session.callId,
    },
    select: { billingReservationId: true },
  });
  const reservationIds = reservations.map(
    (reservation) => reservation.billingReservationId,
  );
  const references: Prisma.BillingTransactionWhereInput[] = [
    { referenceType: "call", referenceId: session.callId },
  ];
  if (reservationIds.length > 0) {
    references.push({
      referenceType: "billing_reservation",
      referenceId: { in: reservationIds },
    });
  }
  const transactions = await prisma.billingTransaction.findMany({
    where: {
      organizationId: session.organizationId,
      type: BillingTransactionType.CALL_SETTLEMENT,
      OR: references,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return selectPendingUsageCheckpoint(
    transactions,
    session.callId,
    session.lastUsageSequence,
  );
}

export function selectPendingUsageCheckpoint(
  transactions: BillingTransaction[],
  callId: string,
  lastUsageSequence: number,
) {
  let pending:
    | { transaction: BillingTransaction; checkpoint: UsageCheckpoint }
    | undefined;
  for (const transaction of transactions) {
    const checkpoint = parseUsageCheckpoint(transaction.metadata);
    if (
      !checkpoint ||
      checkpoint.callId !== callId ||
      checkpoint.sequence <= lastUsageSequence
    ) {
      continue;
    }
    if (!pending || checkpoint.sequence > pending.checkpoint.sequence) {
      pending = { transaction, checkpoint };
    }
  }
  return pending;
}

async function completeUsageCheckpoint(args: {
  session: CallBillingSession;
  checkpoint: UsageCheckpoint;
  settlementDebtDeltaMicros: bigint;
  account: BillingSummary;
}): Promise<CompletedUsageCheckpoint> {
  const { session, checkpoint } = args;
  let account = args.account;
  let nextReservationId: string | null = null;
  let stopReason: string | null =
    account.debtMicros > 0n || session.status === CallBillingSessionStatus.DEBT
      ? "outstanding_debt"
      : null;

  if (!checkpoint.final && !stopReason) {
    const reserveMicros = maxBigInt(BigInt(checkpoint.nextReserveMicros), 1n);
    try {
      const nextReservation = await reserveRollingCreditWithRecovery({
        organizationId: session.organizationId,
        amountMicros: reserveMicros,
        callId: session.callId,
        sequence: checkpoint.sequence,
      });
      nextReservationId =
        nextReservation.reservation.billingReservationId;
      // The reserve changes spendable credit. Threshold decisions and the API
      // response must use this post-reserve projection, not the settlement's
      // stale pre-reserve account snapshot.
      account = nextReservation.account;
    } catch (error) {
      if (error instanceof InsufficientCreditError) {
        stopReason = "insufficient_credit";
      } else if (error instanceof ReservationStateError) {
        stopReason = "billing_reservation_expired";
      } else {
        throw error;
      }
    }
  }

  const hasProvider = checkpoint.telephonyProvider !== null;
  const status = checkpoint.final
    ? hasProvider
      ? CallBillingSessionStatus.RECONCILING
      : account.debtMicros > 0n
        ? CallBillingSessionStatus.DEBT
        : CallBillingSessionStatus.SETTLED
    : stopReason
      ? CallBillingSessionStatus.DEBT
      : CallBillingSessionStatus.ACTIVE;
  const staleBefore = new Date(Date.now() - SNAPSHOT_CLAIM_STALE_MS);
  const updated = await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: session.callBillingSessionId,
      lastUsageSequence: { lt: checkpoint.sequence },
      OR: [
        { processingUsageSequence: checkpoint.sequence },
        { processingUsageSequence: null },
        { processingUsageStartedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status,
      lastUsageSequence: checkpoint.sequence,
      processingUsageSequence: null,
      processingUsageStartedAt: null,
      connectedSeconds: checkpoint.connectedSeconds,
      connectedMilliseconds: BigInt(checkpoint.connectedMilliseconds),
      aiCostMicros: BigInt(checkpoint.aiCostMicros),
      platformCostMicros: BigInt(checkpoint.platformCostMicros),
      telephonyEstimatedMicros: BigInt(
        checkpoint.telephonyEstimatedMicros,
      ),
      totalSettledMicros: BigInt(checkpoint.targetTotalSettledMicros),
      debtIncurredMicros:
        BigInt(checkpoint.priorDebtIncurredMicros) +
        args.settlementDebtDeltaMicros,
      lastModelUsage: checkpoint.modelUsage,
      activeReservationId: nextReservationId,
      sessionId: checkpoint.sessionId,
      roomName: checkpoint.roomName,
      agentId: checkpoint.agentId,
      userId: checkpoint.userId,
      telephonyProvider: checkpoint.telephonyProvider,
      providerCallId: checkpoint.providerCallId,
      ...(checkpoint.final
        ? {
            endedAt: new Date(checkpoint.endedAt!),
            reconciliationNextAt: hasProvider ? new Date() : null,
            reconciliationLastError:
              hasProvider && !checkpoint.providerCallId
                ? "Provider call ID is missing; awaiting durable correlation"
                : null,
          }
        : {}),
    },
  });
  if (updated.count !== 1) {
    const latest = await prisma.callBillingSession.findUniqueOrThrow({
      where: { callBillingSessionId: session.callBillingSessionId },
    });
    if (latest.lastUsageSequence < checkpoint.sequence) {
      throw new Error("Call usage checkpoint is still owned by another worker");
    }
  }

  const latest = await prisma.callBillingSession.findUniqueOrThrow({
    where: { callBillingSessionId: session.callBillingSessionId },
  });
  await syncCallLogBillingCost(latest);
  if (stopReason || shouldAutoRecharge(account)) {
    requestAutoRecharge(session.organizationId);
  }
  return { account, stopReason, status: latest.status };
}

export async function reserveRollingCreditWithRecovery(
  args: {
    organizationId: string;
    callId: string;
    sequence: number;
    amountMicros: bigint;
    now?: Date;
  },
  reserve: typeof reserveUsageCredit = reserveUsageCredit,
) {
  const now = args.now ?? new Date();
  let lastTerminalError: ReservationStateError | null = null;
  for (let generation = 0; generation < 20; generation += 1) {
    const idempotencyKey =
      generation === 0
        ? `call:${args.callId}:reserve:${args.sequence}`
        : `call:${args.callId}:reserve:${args.sequence}:recovery:g${generation}`;
    try {
      return await reserve({
        organizationId: args.organizationId,
        amountMicros: args.amountMicros,
        idempotencyKey,
        referenceType: "call",
        referenceId: args.callId,
        description: "Rolling 60-second call credit reserve",
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
        metadata: {
          sequence: args.sequence,
          recoveryGeneration: generation,
        },
      });
    } catch (error) {
      if (!(error instanceof ReservationStateError)) throw error;
      // The projection may have crashed after creating the next hold and the
      // sweeper may then have released it. Never treat that terminal hold as a
      // successful authorization; advance to a deterministic recovery key.
      lastTerminalError = error;
    }
  }
  throw (
    lastTerminalError ??
    new Error("Rolling billing reserve recovery generations were exhausted")
  );
}

function parseUsageCheckpoint(value: Prisma.JsonValue): UsageCheckpoint | null {
  if (!isRecord(value) || !isRecord(value.usageCheckpoint)) return null;
  const checkpoint = value.usageCheckpoint;
  if (
    checkpoint.version !== USAGE_CHECKPOINT_VERSION ||
    typeof checkpoint.callId !== "string" ||
    !Number.isInteger(checkpoint.sequence) ||
    Number(checkpoint.sequence) < 0 ||
    typeof checkpoint.final !== "boolean" ||
    !Number.isInteger(checkpoint.connectedSeconds) ||
    typeof checkpoint.roomName !== "string" ||
    !Array.isArray(checkpoint.modelUsage)
  ) {
    return null;
  }
  for (const field of [
    "connectedMilliseconds",
    "aiCostMicros",
    "platformCostMicros",
    "telephonyEstimatedMicros",
    "targetTotalSettledMicros",
    "priorDebtIncurredMicros",
    "nextReserveMicros",
  ] as const) {
    if (!isUnsignedIntegerString(checkpoint[field])) return null;
  }
  const endedAt = nullableString(checkpoint.endedAt);
  if (checkpoint.final && !endedAt) return null;
  const provider =
    checkpoint.telephonyProvider === TelephonyProvider.TWILIO ||
    checkpoint.telephonyProvider === TelephonyProvider.TELNYX
      ? checkpoint.telephonyProvider
      : null;
  return {
    version: USAGE_CHECKPOINT_VERSION,
    callId: checkpoint.callId,
    sequence: Number(checkpoint.sequence),
    final: checkpoint.final,
    connectedSeconds: Number(checkpoint.connectedSeconds),
    connectedMilliseconds: String(checkpoint.connectedMilliseconds),
    aiCostMicros: String(checkpoint.aiCostMicros),
    platformCostMicros: String(checkpoint.platformCostMicros),
    telephonyEstimatedMicros: String(checkpoint.telephonyEstimatedMicros),
    targetTotalSettledMicros: String(checkpoint.targetTotalSettledMicros),
    priorDebtIncurredMicros: String(checkpoint.priorDebtIncurredMicros),
    nextReserveMicros: String(checkpoint.nextReserveMicros),
    modelUsage:
      checkpoint.modelUsage as CallUsageSnapshotInput["modelUsage"],
    sessionId: nullableString(checkpoint.sessionId),
    roomName: checkpoint.roomName,
    agentId: nullableString(checkpoint.agentId),
    userId: nullableString(checkpoint.userId),
    telephonyProvider: provider,
    providerCallId: nullableString(checkpoint.providerCallId),
    endedAt,
  };
}

export function calculateRollingReserveMicros(args: {
  configuredReserveMicros: bigint;
  priorConnectedMilliseconds: bigint;
  connectedMilliseconds: bigint;
  priorAiAndPlatformMicros: bigint;
  aiAndPlatformMicros: bigint;
}) {
  const elapsedMilliseconds = positive(
    args.connectedMilliseconds - args.priorConnectedMilliseconds,
  );
  const usageDeltaMicros = positive(
    args.aiAndPlatformMicros - args.priorAiAndPlatformMicros,
  );
  const observedMinuteMicros =
    elapsedMilliseconds > 0n
      ? divideRoundUp(usageDeltaMicros * 60_000n, elapsedMilliseconds)
      : 0n;
  return maxBigInt(args.configuredReserveMicros, observedMinuteMicros);
}

async function syncCallLogBillingCost(session: CallBillingSession) {
  if (
    !session.endedAt ||
    (session.telephonyProvider && session.telephonyFinalMicros === null)
  ) {
    return;
  }
  await prisma.callLog
    .updateMany({
      where: {
        callId: session.callId,
        organizationId: session.organizationId,
      },
      data: { callCostCents: microsToCents(session.totalSettledMicros) },
    })
    .catch(() => undefined);
}

async function claimSnapshot(input: CallUsageSnapshotInput) {
  for (let attempt = 0; attempt < SNAPSHOT_CLAIM_WAIT_ATTEMPTS; attempt += 1) {
    const staleBefore = new Date(Date.now() - SNAPSHOT_CLAIM_STALE_MS);
    const claimed = await prisma.callBillingSession.updateMany({
      where: {
        callId: input.callId,
        organizationId: input.organizationId,
        OR: [
          { lastUsageSequence: { lt: input.sequence } },
          {
            lastModelUsage: { equals: Prisma.DbNull },
            lastUsageSequence: input.sequence,
          },
        ],
        AND: [
          {
            OR: [
              { processingUsageSequence: null },
              { processingUsageStartedAt: { lt: staleBefore } },
            ],
          },
        ],
      },
      data: {
        processingUsageSequence: input.sequence,
        processingUsageStartedAt: new Date(),
      },
    });
    if (claimed.count === 1) return "claimed" as const;

    const latest = await prisma.callBillingSession.findUniqueOrThrow({
      where: { callId: input.callId },
      select: {
        lastUsageSequence: true,
        lastModelUsage: true,
        processingUsageSequence: true,
      },
    });
    if (
      input.sequence < latest.lastUsageSequence ||
      (input.sequence === latest.lastUsageSequence &&
        latest.lastModelUsage !== null)
    ) {
      return "duplicate" as const;
    }
    await delay(SNAPSHOT_CLAIM_WAIT_MS);
  }
  throw new Error("Call usage snapshot is already being processed; retry");
}

function rateCatalogForSession(session: CallBillingSession): Readonly<RateCatalog> {
  const snapshot = session.rateSnapshot as Record<string, unknown>;
  if (snapshot.rateCatalog) {
    return parseRateCatalogSnapshot(snapshot.rateCatalog);
  }
  const current = getRateCatalog();
  if (session.rateCatalogVersion === current.catalogVersion) return current;
  throw new Error(
    `Stored rate catalog ${session.rateCatalogVersion} is unavailable for reconciliation`,
  );
}

function snapshotReserveMicros(session: CallBillingSession) {
  const raw = (session.rateSnapshot as Record<string, unknown>)[
    "initialReserveMicros"
  ];
  return /^\d+$/.test(String(raw ?? "")) ? BigInt(String(raw)) : 1n;
}

function snapshotModels(session: CallBillingSession) {
  const snapshot = session.rateSnapshot as Record<string, unknown>;
  return {
    sttModel:
      typeof snapshot.sttModel === "string" ? snapshot.sttModel : null,
    llmModel:
      typeof snapshot.llmModel === "string" ? snapshot.llmModel : null,
    ttsModel:
      typeof snapshot.ttsModel === "string" ? snapshot.ttsModel : null,
  };
}

function shouldAutoRecharge(account: {
  autoRechargeEnabled: boolean;
  availableUsageMicros: bigint;
  autoRechargeThresholdMicros: bigint;
}) {
  return (
    account.autoRechargeEnabled &&
    account.availableUsageMicros <= account.autoRechargeThresholdMicros
  );
}

function maxBigInt(left: bigint, right: bigint) {
  return left > right ? left : right;
}

function positive(value: bigint) {
  return value > 0n ? value : 0n;
}

function divideRoundUp(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

function microsToCents(micros: bigint) {
  const cents = divideRoundUp(positive(micros), 10_000n);
  return Number(
    cents > BigInt(Number.MAX_SAFE_INTEGER)
      ? BigInt(Number.MAX_SAFE_INTEGER)
      : cents,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isUnsignedIntegerString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function requestAutoRecharge(organizationId: string) {
  void import("./stripe-wallet.service.js")
    .then(({ triggerAutoRecharge }) =>
      triggerAutoRecharge(organizationId, "threshold"),
    )
    .catch(() => undefined);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function hasActiveLegacySubscription(organizationId: string) {
  if (!isHostedBilling) return false;
  const subscription = await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
      plan: { notIn: ["free", "payg"] },
      // Until the transition worker has stopped Stripe dunning, keep every
      // nonterminal legacy subscription out of wallet metering. This prevents
      // a recovered legacy invoice and prepaid debit charging the same call.
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
    },
    select: { id: true },
  });
  return subscription !== null;
}

export async function isLegacyBilledCall(
  organizationId: string,
  callId: string,
) {
  const session = await prisma.callBillingSession.findFirst({
    where: { organizationId, callId },
  });
  return session
    ? sessionBillingMode(session) === LEGACY_BILLING_MODE
    : false;
}

function sessionBillingMode(session: CallBillingSession) {
  return (
    session as CallBillingSession & {
      billingMode?: typeof WALLET_BILLING_MODE | typeof LEGACY_BILLING_MODE;
    }
  ).billingMode ?? WALLET_BILLING_MODE;
}
