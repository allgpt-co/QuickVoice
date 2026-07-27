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
      agent: {
        isActive: true,
        isConfigured: true,
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
      orderBy: { createdAt: "desc" },
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
  return prisma.outboundCall.update({
    where: { outboundId },
    data: {
      status: CallStatus.IN_PROGRESS,
      optionalData,
    },
  });
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
      status: CallStatus.SCHEDULED,
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

export async function listScheduledOutboundIdsForCampaign(campaignId: string) {
  const rows = await prisma.outboundCall.findMany({
    where: {
      campaignId,
      status: CallStatus.SCHEDULED,
    },
    select: { outboundId: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => row.outboundId);
}

export async function markCampaignActive(campaignId: string) {
  return prisma.campaign.update({
    where: { campaignId },
    data: { status: CampaignStatus.ACTIVE, startedAt: new Date() },
  });
}

export async function markCampaignCompleted(campaignId: string) {
  return prisma.campaign.update({
    where: { campaignId },
    data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
  });
}

export async function markCampaignCancelled(args: {
  organizationId: string;
  campaignId: string;
}) {
  await prisma.campaign.update({
    where: { campaignId: args.campaignId },
    data: { status: CampaignStatus.CANCELLED, completedAt: new Date() },
  });
  return getBatchCampaignDetail(args);
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
