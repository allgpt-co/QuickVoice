import { CallStatus, CampaignStatus, OutboundCallMode, Prisma } from "../../../prisma/generated/prisma/client.js";
import { randomUUID } from "node:crypto";

import { generateUploadUrl, readObjectBuffer } from "../../config/s3.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { getOutboundBatchQueue } from "../../queues/outbound-batch.queue.js";
import * as outboundCallRepository from "./outbound-call.repository.js";
import { parseBatchRecipients } from "./outbound-batch-parser.js";
import {
  dispatchScheduledOutboundCall,
  enforcePlanQuota,
} from "./outbound-call.service.js";
import { outboundRuntimeJobId } from "./outbound-runtime-state.js";
import type {
  BatchUploadUrlQuery,
  CreateBatchCampaignArgs,
  ListBatchCampaignsArgs,
} from "./outbound-call.schema.js";

type BatchRepository = {
  getMonthlyUsage: typeof outboundCallRepository.getMonthlyUsage;
  getDialableNumber: typeof outboundCallRepository.getDialableNumber;
  createBatchCampaign: typeof outboundCallRepository.createBatchCampaign;
  listBatchCampaigns: typeof outboundCallRepository.listBatchCampaigns;
  getBatchCampaignDetail: typeof outboundCallRepository.getBatchCampaignDetail;
  getCampaignForImport: typeof outboundCallRepository.getCampaignForImport;
  createBatchOutboundCalls: typeof outboundCallRepository.createBatchOutboundCalls;
  markBatchImported: typeof outboundCallRepository.markBatchImported;
  getCampaignForDispatch: typeof outboundCallRepository.getCampaignForDispatch;
  markCampaignActive: typeof outboundCallRepository.markCampaignActive;
  markCampaignCompleted: typeof outboundCallRepository.markCampaignCompleted;
  markCampaignCancelled: typeof outboundCallRepository.markCampaignCancelled;
  listScheduledOutboundIdsForCampaign: typeof outboundCallRepository.listScheduledOutboundIdsForCampaign;
};

type BatchQueueLike = {
  add: (
    name: "import" | "dispatch-campaign" | "dispatch-call",
    data: Record<string, string>,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
};

type ImportBatchDeps = {
  repository?: Pick<
    BatchRepository,
    "getCampaignForImport" | "createBatchOutboundCalls" | "markBatchImported"
  >;
  queue?: BatchQueueLike;
  readFile?: (key: string) => Promise<Buffer>;
  now?: () => Date;
};

type DispatchCampaignDeps = {
  repository?: Pick<
    BatchRepository,
    | "getCampaignForDispatch"
    | "markCampaignActive"
    | "markCampaignCompleted"
    | "listScheduledOutboundIdsForCampaign"
  >;
  queue?: BatchQueueLike;
};

type CreateBatchCampaignDeps = {
  repository?: Pick<
    BatchRepository,
    "getMonthlyUsage" | "getDialableNumber" | "createBatchCampaign"
  >;
  queue?: BatchQueueLike;
  now?: () => Date;
};

type BatchUploadUrlDeps = {
  generateUploadUrl?: typeof generateUploadUrl;
  randomUUID?: typeof randomUUID;
};

type ListBatchCampaignsDeps = {
  repository?: Pick<BatchRepository, "listBatchCampaigns">;
};

type GetBatchCampaignDeps = {
  repository?: Pick<BatchRepository, "getBatchCampaignDetail">;
};

type CancelBatchCampaignDeps = {
  repository?: Pick<
    BatchRepository,
    "getBatchCampaignDetail" | "markCampaignCancelled"
  >;
};

export async function createBatchUploadUrl(
  args: BatchUploadUrlQuery & { organizationId: string },
  deps: BatchUploadUrlDeps = {}
) {
  const createUploadUrl = deps.generateUploadUrl ?? generateUploadUrl;
  const createId = deps.randomUUID ?? randomUUID;
  const safeFileName = args.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const s3Key = `outbound-batches/${args.organizationId}/${createId()}-${safeFileName}`;
  const uploadUrl = await createUploadUrl(s3Key, args.contentType);
  return { uploadUrl, s3Key };
}

export async function createBatchCampaign(
  args: CreateBatchCampaignArgs,
  deps: CreateBatchCampaignDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const queue = deps.queue ?? getOutboundBatchQueue();

  await enforcePlanQuota(repository, args.organizationId);

  const dialableNumber = await repository.getDialableNumber({
    organizationId: args.organizationId,
    agentId: args.agentId,
    fromNumber: args.fromNumber,
  });

  if (!dialableNumber) {
    throw new BadRequestError(
      "From number must belong to this organization and be linked to the selected agent"
    );
  }

  const campaign = await repository.createBatchCampaign({
    ...args,
    scheduledAt: args.scheduledAt ?? null,
    status: CampaignStatus.SCHEDULED,
  });

  await queue.add(
    "import",
    { campaignId: campaign.campaignId },
    {
      jobId: outboundRuntimeJobId("batch-import", campaign.campaignId),
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );

  return campaign;
}

export async function listBatchCampaigns(
  args: ListBatchCampaignsArgs,
  deps: ListBatchCampaignsDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  return repository.listBatchCampaigns(args);
}

export async function getBatchCampaignDetail(
  args: { organizationId: string; campaignId: string },
  deps: GetBatchCampaignDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  return repository.getBatchCampaignDetail(args);
}

export async function cancelBatchCampaign(
  args: { organizationId: string; campaignId: string },
  deps: CancelBatchCampaignDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const campaign = await repository.getBatchCampaignDetail(args);
  if (!campaign) {
    throw new BadRequestError("Batch campaign not found");
  }

  if (campaign.status !== CampaignStatus.SCHEDULED && campaign.status !== CampaignStatus.PROCESSED) {
    throw new BadRequestError("Only scheduled campaigns can be cancelled");
  }

  return repository.markCampaignCancelled(args);
}

export async function importBatchCampaignRecipients(
  args: { campaignId: string },
  deps: ImportBatchDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const queue = deps.queue ?? getOutboundBatchQueue();
  const readFile = deps.readFile ?? readObjectBuffer;
  const now = deps.now ?? (() => new Date());

  const campaign = await repository.getCampaignForImport(args.campaignId);
  if (!campaign) {
    throw new Error("Batch campaign not found");
  }
  if (!campaign.sourceFileKey) {
    throw new Error("Batch campaign source file is missing");
  }

  const file = await readFile(campaign.sourceFileKey);
  const parsed = parseBatchRecipients(file, campaign.sourceFileName ?? "recipients.csv");
  const rows = [
    ...parsed.validRows.map((row) => ({
      organizationId: campaign.organizationId,
      userId: campaign.userId,
      agentId: campaign.agentId,
      campaignId: campaign.campaignId,
      scheduledAt: campaign.scheduledAt,
      phoneNumber: row.phoneNumber,
      fromNumber: campaign.fromNumber,
      firstMessage: row.firstMessage,
      systemPrompt: row.systemPrompt,
      mode: OutboundCallMode.campaign,
      status: CallStatus.SCHEDULED,
      optionalData: {
        rowNumber: row.rowNumber,
        language: row.language,
        voiceId: row.voiceId,
        dynamicVariables: row.dynamicVariables,
        ringingTimeoutSeconds: campaign.ringingTimeoutSeconds,
        sourceFileName: campaign.sourceFileName,
      } satisfies Prisma.InputJsonObject,
    })),
    ...parsed.invalidRows.map((row) => ({
      organizationId: campaign.organizationId,
      userId: campaign.userId,
      agentId: campaign.agentId,
      campaignId: campaign.campaignId,
      scheduledAt: campaign.scheduledAt,
      phoneNumber: row.phoneNumber,
      fromNumber: campaign.fromNumber,
      firstMessage: null,
      systemPrompt: null,
      mode: OutboundCallMode.campaign,
      status: CallStatus.FAILED,
      optionalData: {
        rowNumber: row.rowNumber,
        importError: row.error,
        raw: row.raw,
        sourceFileName: campaign.sourceFileName,
      } satisfies Prisma.InputJsonObject,
    })),
  ];

  await repository.createBatchOutboundCalls(rows);
  await repository.markBatchImported(campaign.campaignId, {
    totalRecipients: parsed.validRows.length + parsed.invalidRows.length,
    validRecipients: parsed.validRows.length,
    invalidRecipients: parsed.invalidRows.length,
  });

  await queue.add(
    "dispatch-campaign",
    { campaignId: campaign.campaignId },
    {
      delay: dispatchDelay(campaign.scheduledAt, now()),
      jobId: outboundRuntimeJobId("batch-dispatch", campaign.campaignId),
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
}

export async function dispatchBatchCampaign(
  args: { campaignId: string },
  deps: DispatchCampaignDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const queue = deps.queue ?? getOutboundBatchQueue();
  const campaign = await repository.getCampaignForDispatch(args.campaignId);
  if (!campaign) return;

  const outboundIds = await repository.listScheduledOutboundIdsForCampaign(
    campaign.campaignId
  );
  if (outboundIds.length === 0) {
    await repository.markCampaignCompleted(campaign.campaignId);
    return;
  }

  await repository.markCampaignActive(campaign.campaignId);
  await Promise.all(
    outboundIds.map((outboundId) =>
      queue.add(
        "dispatch-call",
        { outboundId },
        {
          jobId: outboundRuntimeJobId("call-dispatch", outboundId),
          removeOnComplete: 100,
          removeOnFail: 200,
        }
      )
    )
  );
}

export async function dispatchBatchOutboundCall(args: { outboundId: string }) {
  await dispatchScheduledOutboundCall(args.outboundId);
}

function dispatchDelay(scheduledAt: Date | null, now: Date) {
  if (!scheduledAt) return 0;
  return Math.max(0, scheduledAt.getTime() - now.getTime());
}
