import { CallStatus, CampaignStatus, OutboundCallMode, Prisma } from "../../../prisma/generated/prisma/client.js";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import { generateUploadUrl, readObjectBuffer } from "../../config/s3.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { getOutboundBatchQueue } from "../../queues/outbound-batch.queue.js";
import * as outboundCallRepository from "./outbound-call.repository.js";
import { parseBatchRecipients } from "./outbound-batch-parser.js";
import {
  dispatchScheduledOutboundCall,
  enforcePlanQuota,
} from "./outbound-call.service.js";
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
  > & { markCampaignFailed?: typeof outboundCallRepository.markCampaignFailed };
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
  const filePolicy = inspectBatchFile(args.fileName, args.contentType);
  if (!filePolicy) {
    throw new BadRequestError(
      "Batch file type does not match a supported CSV or XLSX format"
    );
  }
  const maxUploadBytes = readPositiveInteger(
    "OUTBOUND_BATCH_MAX_UPLOAD_BYTES",
    5 * 1024 * 1024,
    50 * 1024 * 1024
  );
  if (args.fileSize > maxUploadBytes) {
    throw new BadRequestError("Batch file exceeds the configured upload limit");
  }

  const s3Key = `outbound-batches/${args.organizationId}/${createId()}.${filePolicy.extension}`;
  const uploadUrl = await createUploadUrl(
    s3Key,
    filePolicy.contentType,
    args.fileSize
  );
  return {
    uploadUrl,
    s3Key,
    contentType: filePolicy.contentType,
    maxUploadBytes,
  };
}

export async function createBatchCampaign(
  args: CreateBatchCampaignArgs,
  deps: CreateBatchCampaignDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const queue = deps.queue ?? getOutboundBatchQueue();

  if (
    !isValidBatchStorageKey(
      args.sourceFileKey,
      args.sourceFileName,
      args.organizationId
    )
  ) {
    throw new BadRequestError(
      "Batch file reference is invalid for the active organization"
    );
  }

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
      jobId: `outbound-batch-import-${campaign.campaignId}`,
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
  let parsed;
  try {
    parsed = parseBatchRecipients(
      file,
      campaign.sourceFileName ?? "recipients.csv"
    );
  } catch (error) {
    await repository.markCampaignFailed?.(campaign.campaignId);
    throw error;
  }
  const recipientCount =
    parsed.validRows.length + parsed.invalidRows.length;
  const maxRecipients = readPositiveInteger(
    "OUTBOUND_BATCH_MAX_RECIPIENTS",
    10_000,
    100_000
  );
  if (recipientCount > maxRecipients) {
    await repository.markCampaignFailed?.(campaign.campaignId);
    throw new BadRequestError(
      `Batch campaign exceeds the ${maxRecipients} recipient limit`
    );
  }
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
      jobId: `outbound-batch-dispatch-${campaign.campaignId}`,
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
          jobId: `outbound-call-dispatch-${outboundId}`,
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

function inspectBatchFile(fileName: string, contentType: string) {
  const extension = extname(fileName).slice(1).toLowerCase();
  const normalizedContentType =
    contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const allowedContentTypes =
    extension === "csv"
      ? new Set(["text/csv", "application/csv", "application/octet-stream"])
      : extension === "xlsx"
        ? new Set([
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream",
          ])
        : null;

  return allowedContentTypes?.has(normalizedContentType)
    ? { extension, contentType: normalizedContentType }
    : null;
}

function isValidBatchStorageKey(
  key: string,
  fileName: string,
  organizationId: string
) {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") return false;
  const prefix = `outbound-batches/${organizationId}/`;
  if (!key.startsWith(prefix)) return false;
  const objectName = key.slice(prefix.length);
  return new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${extension}$`,
    "i"
  ).test(objectName);
}

function readPositiveInteger(
  name: string,
  fallback: number,
  maximum: number
) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}
