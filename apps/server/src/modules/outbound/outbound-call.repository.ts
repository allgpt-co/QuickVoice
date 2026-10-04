import { nextCampaignDailyPass } from "./campaign-time.js";
import {
  CallStatus,
  CampaignStatus,
  OutboundCallMode,
  Prisma,
} from "../../../prisma/generated/prisma/client.js";
import { plans } from "../../../data/plans.js";
import prisma from "../../config/prisma.js";
import type {
  ListOutboundCallsArgs,
  QuickOutboundCallArgs,
} from "./outbound-call.schema.js";

type CreateQuickCallInput = QuickOutboundCallArgs & {
  status: typeof CallStatus.SCHEDULED;
  mode: typeof OutboundCallMode.quick;
  optionalData: Prisma.InputJsonObject;
};

export async function createQuickCall(input: CreateQuickCallInput) {
  return prisma.outboundCall.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      agentId: input.agentId,
      phoneNumber: input.phoneNumber,
      fromNumber: input.fromNumber,
      firstMessage: input.firstMessage,
      systemPrompt: input.systemPrompt,
      optionalData: input.optionalData,
      mode: input.mode,
      status: input.status,
    },
  });
}

export async function getDialableNumber(args: {
  organizationId: string;
  agentId: string;
  fromNumber: string;
}) {
  return prisma.phoneNumber.findFirst({
    where: {
      organizationId: args.organizationId,
      agentId: args.agentId,
      number: args.fromNumber,
      billingStatus: "ACTIVE",
      agent: {
        isActive: true,
        isConfigured: true,
        deletionRequestedAt: null,
      },
    },
    select: {
      number: true,
      sid: true,
      provider: true,
    },
  });
}

export async function listForOrg(args: ListOutboundCallsArgs) {
  const where = outboundWhere(args);
  const [items, count] = await prisma.$transaction([
    prisma.outboundCall.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { outboundId: "desc" }],
      take: args.limit,
      ...(args.cursor ? { cursor: { outboundId: args.cursor }, skip: 1 } : {}),
      include: {
        callLog: {
          select: {
            callId: true,
            status: true,
            startTime: true,
            endTime: true,
            durationSeconds: true,
          },
        },
      },
    }),
    prisma.outboundCall.count({ where }),
  ]);

  return { items, count };
}

export async function getForOrg(outboundId: string, organizationId: string) {
  return prisma.outboundCall.findFirst({
    where: { outboundId, organizationId },
    include: {
      callLog: {
        select: {
          callId: true,
          status: true,
          startTime: true,
          endTime: true,
          durationSeconds: true,
        },
      },
    },
  });
}

export async function markInProgress(
  outboundId: string,
  optionalData: Prisma.InputJsonObject,
) {
  const updated = await prisma.outboundCall.updateMany({
    where: {
      outboundId,
      status: { in: [CallStatus.SCHEDULED, CallStatus.PROCESSED] },
    },
    data: {
      status: CallStatus.IN_PROGRESS,
      optionalData,
    },
  });
  if (updated.count !== 1) return null;
  return prisma.outboundCall.findUnique({ where: { outboundId } });
}

export async function markFailed(outboundId: string, reason: string) {
  const existing = await prisma.outboundCall.findUnique({
    where: { outboundId },
    select: { optionalData: true },
  });
  return prisma.outboundCall.update({
    where: { outboundId },
    data: {
      status: CallStatus.FAILED,
      optionalData: {
        ...jsonObject(existing?.optionalData),
        failureReason: reason,
      } as Prisma.InputJsonObject,
    },
  });
}

export async function markCancelled(args: {
  outboundId: string;
  organizationId: string;
  userId: string;
  reason: string;
}) {
  const existing = await getForOrg(args.outboundId, args.organizationId);
  const optionalData = {
    ...jsonObject(existing?.optionalData),
    cancelledAt: new Date().toISOString(),
    cancelledBy: args.userId,
    cancellationReason: args.reason,
    failureReason: args.reason,
  } satisfies Prisma.InputJsonObject;

  return prisma.outboundCall.update({
    where: { outboundId: args.outboundId },
    data: {
      status: CallStatus.FAILED,
      optionalData,
    },
    include: {
      callLog: {
        select: {
          callId: true,
          status: true,
          startTime: true,
          endTime: true,
          durationSeconds: true,
        },
      },
    },
  });
}

export async function getOutboundCallForDispatch(outboundId: string) {
  return prisma.outboundCall.findFirst({
    where: {
      outboundId,
      status: CallStatus.PROCESSED,
      campaign: { status: CampaignStatus.ACTIVE },
    },
    select: {
      outboundId: true,
      organizationId: true,
      userId: true,
      agentId: true,
      campaignId: true,
      phoneNumber: true,
      fromNumber: true,
      firstMessage: true,
      systemPrompt: true,
      optionalData: true,
    },
  });
}

export async function claimQuickOutboundCall(
  outboundId: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const outbound = await tx.outboundCall.findUnique({
      where: { outboundId },
      select: { agentId: true, status: true },
    });
    if (!outbound?.agentId || outbound.status !== CallStatus.SCHEDULED) {
      return { claimed: false, reason: "Outbound call is no longer scheduled" };
    }

    const limits = await lockAndReadAgentCallLimits(tx, outbound.agentId);
    const capacity = await readAgentDispatchCapacity(
      tx,
      outbound.agentId,
      limits,
      now,
    );
    if (capacity.concurrentRemaining < 1) {
      return { claimed: false, reason: "Agent concurrent call limit reached" };
    }
    if (capacity.dailyRemaining < 1) {
      return { claimed: false, reason: "Agent daily call limit reached" };
    }

    const claimed = await tx.outboundCall.updateMany({
      where: { outboundId, status: CallStatus.SCHEDULED },
      data: { status: CallStatus.PROCESSED },
    });
    if (claimed.count === 1) {
      await tx.$executeRaw`
        UPDATE "OutboundCall"
        SET "dispatchClaimedAt" = ${now}
        WHERE "outboundId" = ${outboundId}
          AND "status" = 'PROCESSED'
      `;
    }
    return claimed.count === 1
      ? { claimed: true as const, reason: null }
      : {
          claimed: false as const,
          reason: "Outbound call is no longer scheduled",
        };
  });
}

type CreateBatchCampaignInput = {
  organizationId: string;
  userId: string;
  name: string;
  agentId: string;
  fromNumber: string;
  scheduledAt: Date | null;
  sourceFileKey: string;
  sourceFileName: string;
  ringingTimeoutSeconds: number;
  timezone: string;
  status: typeof CampaignStatus.SCHEDULED;
};

export async function createBatchCampaign(input: CreateBatchCampaignInput) {
  return prisma.campaign.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      name: input.name,
      agentId: input.agentId,
      fromNumber: input.fromNumber,
      scheduledAt: input.scheduledAt,
      sourceFileKey: input.sourceFileKey,
      sourceFileName: input.sourceFileName,
      ringingTimeoutSeconds: input.ringingTimeoutSeconds,
      timezone: input.timezone,
      status: input.status,
    },
  });
}

export async function listBatchCampaigns(args: {
  organizationId: string;
  agentId?: string;
}) {
  return prisma.campaign.findMany({
    where: {
      organizationId: args.organizationId,
      ...(args.agentId ? { agentId: args.agentId } : {}),
    },
    select: {
      campaignId: true,
      name: true,
      agentId: true,
      fromNumber: true,
      scheduledAt: true,
      sourceFileName: true,
      totalRecipients: true,
      validRecipients: true,
      invalidRecipients: true,
      ringingTimeoutSeconds: true,
      timezone: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBatchCampaignDetail(args: {
  organizationId: string;
  campaignId: string;
}) {
  return prisma.campaign.findFirst({
    where: {
      organizationId: args.organizationId,
      campaignId: args.campaignId,
    },
    select: {
      campaignId: true,
      name: true,
      agentId: true,
      fromNumber: true,
      scheduledAt: true,
      sourceFileKey: true,
      sourceFileName: true,
      totalRecipients: true,
      validRecipients: true,
      invalidRecipients: true,
      ringingTimeoutSeconds: true,
      timezone: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      completedAt: true,
      outboundCalls: {
        select: {
          outboundId: true,
          phoneNumber: true,
          firstMessage: true,
          systemPrompt: true,
          optionalData: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getBatchCampaignResults(args: {
  organizationId: string;
  campaignId: string;
}) {
  return prisma.campaign.findFirst({
    where: {
      organizationId: args.organizationId,
      campaignId: args.campaignId,
    },
    select: {
      campaignId: true,
      name: true,
      outboundCalls: {
        select: {
          outboundId: true,
          phoneNumber: true,
          optionalData: true,
          status: true,
          createdAt: true,
          callLog: {
            select: {
              callId: true,
              status: true,
              startTime: true,
              endTime: true,
              durationSeconds: true,
              dataExtracted: true,
              dataEvaluation: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

type CreateBatchOutboundCallInput = {
  organizationId: string;
  userId: string | null;
  agentId: string | null;
  campaignId: string;
  scheduledAt: Date | null;
  phoneNumber: string;
  fromNumber: string;
  firstMessage: string | null;
  systemPrompt: string | null;
  optionalData: Prisma.InputJsonObject;
  mode: typeof OutboundCallMode.campaign;
  status: typeof CallStatus.SCHEDULED | typeof CallStatus.FAILED;
};

export async function getCampaignForImport(campaignId: string) {
  return prisma.campaign.findFirst({
    where: {
      campaignId,
      status: CampaignStatus.SCHEDULED,
    },
    select: {
      campaignId: true,
      organizationId: true,
      userId: true,
      agentId: true,
      fromNumber: true,
      scheduledAt: true,
      sourceFileKey: true,
      sourceFileName: true,
      ringingTimeoutSeconds: true,
    },
  });
}

export async function createBatchOutboundCalls(
  rows: CreateBatchOutboundCallInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.outboundCall.createMany({
    data: rows,
  });
}

export async function markBatchImported(
  campaignId: string,
  stats: {
    totalRecipients: number;
    validRecipients: number;
    invalidRecipients: number;
  },
) {
  return prisma.campaign.update({
    where: { campaignId },
    data: stats,
  });
}

export async function getCampaignForDispatch(campaignId: string) {
  return prisma.campaign.findFirst({
    where: {
      campaignId,
      status: CampaignStatus.SCHEDULED,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
    select: { campaignId: true },
  });
}

export async function claimCampaignDispatchSlots(
  campaignId: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { campaignId, status: CampaignStatus.ACTIVE },
      select: { agentId: true, timezone: true, scheduledAt: true, startedAt: true, createdAt: true },
    });
    if (!campaign?.agentId) return null;

    const limits = await lockAndReadAgentCallLimits(tx, campaign.agentId);
    const capacity = await readAgentDispatchCapacity(
      tx,
      campaign.agentId,
      limits,
      now,
    );
    const available = Math.min(
      capacity.concurrentRemaining,
      capacity.dailyRemaining,
    );
    const candidates =
      available > 0
        ? await tx.outboundCall.findMany({
            where: { campaignId, status: CallStatus.SCHEDULED },
            select: { outboundId: true },
            orderBy: { createdAt: "asc" },
            take: available,
          })
        : [];
    const outboundIds = candidates.map((row) => row.outboundId);
    if (outboundIds.length > 0) {
      await tx.outboundCall.updateMany({
        where: {
          outboundId: { in: outboundIds },
          campaignId,
          status: CallStatus.SCHEDULED,
          campaign: { status: CampaignStatus.ACTIVE },
        },
        data: { status: CallStatus.PROCESSED },
      });
      await tx.$executeRaw`
        UPDATE "OutboundCall"
        SET "dispatchClaimedAt" = ${now}
        WHERE "outboundId" IN (${Prisma.join(outboundIds)})
          AND "status" = 'PROCESSED'
      `;
    }

    // A previous process may have committed the claim before Redis accepted
    // the job. Re-enqueue all outstanding claims with stable BullMQ job IDs.
    const pending = await tx.outboundCall.findMany({
      where: { campaignId, status: CallStatus.PROCESSED },
      select: { outboundId: true },
      orderBy: [{ createdAt: "asc" }, { outboundId: "asc" }],
    });

    const [scheduledRemaining, campaignActiveCalls] = await Promise.all([
      tx.outboundCall.count({
        where: { campaignId, status: CallStatus.SCHEDULED },
      }),
      tx.outboundCall.count({
        where: {
          campaignId,
          status: { in: [CallStatus.PROCESSED, CallStatus.IN_PROGRESS] },
        },
      }),
    ]);
    return {
      outboundIds: pending.map((row) => row.outboundId),
      scheduledRemaining,
      campaignActiveCalls,
      dailyLimitReached: capacity.dailyRemaining <= outboundIds.length,
      ...(capacity.dailyRemaining <= outboundIds.length ? {
        resumeAt: nextCampaignDailyPass(now, campaign.scheduledAt ?? campaign.startedAt ?? campaign.createdAt ?? now, campaign.timezone ?? "UTC"),
      } : {}),
    };
  });
}

export async function markCampaignActive(campaignId: string) {
  await prisma.campaign.updateMany({
    where: {
      campaignId,
      status: CampaignStatus.SCHEDULED,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
    data: { status: CampaignStatus.ACTIVE, startedAt: new Date() },
  });
  return (
    (await prisma.campaign.count({
      where: { campaignId, status: CampaignStatus.ACTIVE },
    })) === 1
  );
}

export async function markCampaignCompleted(campaignId: string) {
  return prisma.campaign.updateMany({
    where: { campaignId, status: CampaignStatus.ACTIVE },
    data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
  });
}

export async function markCampaignCancelled(args: {
  organizationId: string;
  campaignId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: {
        campaignId: args.campaignId,
        organizationId: args.organizationId,
      },
      select: { status: true },
    });
    if (!campaign) return null;

    const cancellable = new Set<CampaignStatus>([
      CampaignStatus.SCHEDULED,
      CampaignStatus.PROCESSED,
      CampaignStatus.ACTIVE,
    ]);
    if (
      !cancellable.has(campaign.status) &&
      campaign.status !== CampaignStatus.CANCELLED
    ) {
      return { cancelled: false, runningOutboundIds: [] as string[] };
    }

    if (campaign.status !== CampaignStatus.CANCELLED) {
      const cancelled = await tx.campaign.updateMany({
        where: {
          campaignId: args.campaignId,
          organizationId: args.organizationId,
          status: campaign.status,
        },
        data: { status: CampaignStatus.CANCELLED, completedAt: new Date() },
      });
      if (cancelled.count !== 1) {
        return { cancelled: false, runningOutboundIds: [] as string[] };
      }
    }

    const running = await tx.outboundCall.findMany({
      where: {
        campaignId: args.campaignId,
        status: CallStatus.IN_PROGRESS,
      },
      select: { outboundId: true },
    });
    await tx.outboundCall.updateMany({
      where: {
        campaignId: args.campaignId,
        status: { in: [CallStatus.SCHEDULED, CallStatus.PROCESSED] },
      },
      data: { status: CallStatus.FAILED },
    });

    return {
      cancelled: true,
      runningOutboundIds: running.map((call) => call.outboundId),
    };
  });
  if (!result) return null;
  return { ...result, campaign: await getBatchCampaignDetail(args) };
}

export async function markCampaignFailed(campaignId: string) {
  return prisma.campaign.updateMany({
    where: {
      campaignId,
      status: CampaignStatus.SCHEDULED,
    },
    data: {
      status: CampaignStatus.FAILED,
      completedAt: new Date(),
    },
  });
}

export async function getMonthlyUsage(
  organizationId: string,
  now = new Date(),
) {
  const [organization, usage] = await prisma.$transaction([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    }),
    prisma.callLog.aggregate({
      where: {
        organizationId,
        deleted: false,
        startTime: { gte: startOfUtcMonth(now) },
      },
      _sum: { durationSeconds: true },
    }),
  ]);

  const plan = organization?.plan ?? "free";
  const includedMinutes =
    plans.find((item) => item.id === plan)?.minutes ?? null;

  return {
    plan,
    includedMinutes,
    usedSeconds: usage._sum.durationSeconds ?? 0,
  };
}

async function lockAndReadAgentCallLimits(
  tx: Prisma.TransactionClient,
  agentId: string,
) {
  await tx.$queryRaw`
    SELECT "agentId"
    FROM "Agent"
    WHERE "agentId" = ${agentId}
    FOR UPDATE
  `;
  const configuration = await tx.agentConfiguration.findUnique({
    where: { agentId },
    select: { concurrent_calls_limit: true, daily_calls_limit: true },
  });
  if (!configuration) {
    throw new Error("Agent call limits are not configured");
  }
  return {
    concurrent: Math.max(1, configuration.concurrent_calls_limit),
    daily: Math.max(1, configuration.daily_calls_limit),
  };
}

async function readAgentDispatchCapacity(
  tx: Prisma.TransactionClient,
  agentId: string,
  limits: { concurrent: number; daily: number },
  now: Date,
) {
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfTomorrow = new Date(startOfDay.getTime() + 86_400_000);
  const [activeRows, dailyRows] = await Promise.all([
    tx.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT "callId" AS id
        FROM "CallBillingSession"
        WHERE "agentId" = ${agentId}
          AND "status" IN ('AUTHORIZED', 'ACTIVE')
        UNION
        SELECT "outboundId" AS id
        FROM "OutboundCall"
        WHERE "agentId" = ${agentId}
          AND "status" IN ('PROCESSED', 'IN_PROGRESS')
      ) AS active_calls
    `,
    tx.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT "callId" AS id
        FROM "CallBillingSession"
        WHERE "agentId" = ${agentId}
          AND "createdAt" >= ${startOfDay}
          AND "createdAt" < ${startOfTomorrow}
        UNION
        SELECT "outboundId" AS id
        FROM "OutboundCall"
        WHERE "agentId" = ${agentId}
          AND "dispatchClaimedAt" >= ${startOfDay}
          AND "dispatchClaimedAt" < ${startOfTomorrow}
      ) AS daily_calls
    `,
  ]);
  const activeCalls = Number(activeRows[0]?.count ?? 0);
  const dailyCalls = Number(dailyRows[0]?.count ?? 0);
  return {
    activeCalls,
    concurrentRemaining: Math.max(0, limits.concurrent - activeCalls),
    dailyRemaining: Math.max(0, limits.daily - dailyCalls),
  };
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function outboundWhere(
  args: ListOutboundCallsArgs,
): Prisma.OutboundCallWhereInput {
  return {
    organizationId: args.organizationId,
    ...(args.agentId ? { agentId: args.agentId } : {}),
    ...(args.status ? { status: args.status } : {}),
    ...(args.mode ? { mode: args.mode } : {}),
  };
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Prisma.InputJsonObject;
}

export async function listActiveCampaignsForRecovery(cursor?: string) {
  return prisma.campaign.findMany({
    where: { status: CampaignStatus.ACTIVE },
    select: { campaignId: true },
    orderBy: { campaignId: "asc" },
    take: 100,
    ...(cursor ? { cursor: { campaignId: cursor }, skip: 1 } : {}),
  });
}
