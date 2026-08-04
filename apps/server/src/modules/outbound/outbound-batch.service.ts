import {
  CallStatus,
  CampaignStatus,
  OutboundCallMode,
  Prisma,
} from "../../../prisma/generated/prisma/client.js";
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
import { hasActiveLegacySubscription } from "../billing/call-metering.service.js";
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
  getBatchCampaignResults: typeof outboundCallRepository.getBatchCampaignResults;
  listScheduledOutboundIdsForCampaign: typeof outboundCallRepository.listScheduledOutboundIdsForCampaign;
};

type BatchQueueLike = {
  add: (
    name: "import" | "dispatch-campaign" | "dispatch-call",
    data: Record<string, string>,
    options?: Record<string, unknown>,
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
  hasActiveLegacySubscription?: typeof hasActiveLegacySubscription;
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

type ExportBatchCampaignResultsDeps = {
  repository?: Pick<BatchRepository, "getBatchCampaignResults">;
};

type CancelBatchCampaignDeps = {
  repository?: Pick<
    BatchRepository,
    "getBatchCampaignDetail" | "markCampaignCancelled"
  >;
};

export async function createBatchUploadUrl(
  args: BatchUploadUrlQuery & { organizationId: string },
  deps: BatchUploadUrlDeps = {},
) {
  const createUploadUrl = deps.generateUploadUrl ?? generateUploadUrl;
  const createId = deps.randomUUID ?? randomUUID;
  const filePolicy = inspectBatchFile(args.fileName, args.contentType);
  if (!filePolicy) {
    throw new BadRequestError(
      "Batch file type does not match a supported CSV or XLSX format",
    );
  }
  const maxUploadBytes = readPositiveInteger(
    "OUTBOUND_BATCH_MAX_UPLOAD_BYTES",
    5 * 1024 * 1024,
    50 * 1024 * 1024,
  );
  if (args.fileSize > maxUploadBytes) {
    throw new BadRequestError("Batch file exceeds the configured upload limit");
  }

  const s3Key = `outbound-batches/${args.organizationId}/${createId()}.${filePolicy.extension}`;
  const uploadUrl = await createUploadUrl(
    s3Key,
    filePolicy.contentType,
    args.fileSize,
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
  deps: CreateBatchCampaignDeps = {},
) {
  const repository = deps.repository ?? outboundCallRepository;
  const queue = deps.queue ?? getOutboundBatchQueue();

  if (
    !isValidBatchStorageKey(
      args.sourceFileKey,
      args.sourceFileName,
      args.organizationId,
    )
  ) {
    throw new BadRequestError(
      "Batch file reference is invalid for the active organization",
    );
  }

  await enforcePlanQuota(
    repository,
    args.organizationId,
    deps.hasActiveLegacySubscription,
  );

  const dialableNumber = await repository.getDialableNumber({
    organizationId: args.organizationId,
    agentId: args.agentId,
    fromNumber: args.fromNumber,
  });

  if (!dialableNumber) {
    throw new BadRequestError(
      "From number must belong to this organization and be linked to the selected agent",
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
    },
  );

  return campaign;
}

export async function listBatchCampaigns(
  args: ListBatchCampaignsArgs,
  deps: ListBatchCampaignsDeps = {},
) {
  const repository = deps.repository ?? outboundCallRepository;
  return repository.listBatchCampaigns(args);
}

export async function getBatchCampaignDetail(
  args: { organizationId: string; campaignId: string },
  deps: GetBatchCampaignDeps = {},
) {
  const repository = deps.repository ?? outboundCallRepository;
  return repository.getBatchCampaignDetail(args);
}

export async function exportBatchCampaignResultsCsv(
  args: { organizationId: string; campaignId: string },
  deps: ExportBatchCampaignResultsDeps = {},
) {
  const repository = deps.repository ?? outboundCallRepository;
  const campaign = await repository.getBatchCampaignResults(args);
  if (!campaign) {
    throw new BadRequestError("Batch campaign not found");
  }

  return {
    filename: `${safeFilename(campaign.name || "campaign")}-results.csv`,
    content: buildBatchCampaignResultsCsv(campaign),
  };
}

export async function cancelBatchCampaign(
  args: { organizationId: string; campaignId: string },
  deps: CancelBatchCampaignDeps = {},
) {
  const repository = deps.repository ?? outboundCallRepository;
  const campaign = await repository.getBatchCampaignDetail(args);
  if (!campaign) {
    throw new BadRequestError("Batch campaign not found");
  }

  if (
    campaign.status !== CampaignStatus.SCHEDULED &&
    campaign.status !== CampaignStatus.PROCESSED
  ) {
    throw new BadRequestError("Only scheduled campaigns can be cancelled");
  }

  return repository.markCampaignCancelled(args);
}

export async function importBatchCampaignRecipients(
  args: { campaignId: string },
  deps: ImportBatchDeps = {},
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
      campaign.sourceFileName ?? "recipients.csv",
    );
  } catch (error) {
    await repository.markCampaignFailed?.(campaign.campaignId);
    throw error;
  }
  const recipientCount = parsed.validRows.length + parsed.invalidRows.length;
  const maxRecipients = readPositiveInteger(
    "OUTBOUND_BATCH_MAX_RECIPIENTS",
    10_000,
    100_000,
  );
  if (recipientCount > maxRecipients) {
    await repository.markCampaignFailed?.(campaign.campaignId);
    throw new BadRequestError(
      `Batch campaign exceeds the ${maxRecipients} recipient limit`,
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
    },
  );
}

export async function dispatchBatchCampaign(
  args: { campaignId: string },
  deps: DispatchCampaignDeps = {},
) {
  const repository = deps.repository ?? outboundCallRepository;
  const queue = deps.queue ?? getOutboundBatchQueue();
  const campaign = await repository.getCampaignForDispatch(args.campaignId);
  if (!campaign) return;

  const outboundIds = await repository.listScheduledOutboundIdsForCampaign(
    campaign.campaignId,
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
        },
      ),
    ),
  );
}

export async function dispatchBatchOutboundCall(args: { outboundId: string }) {
  await dispatchScheduledOutboundCall(args.outboundId);
}

type CampaignResults = NonNullable<
  Awaited<ReturnType<typeof outboundCallRepository.getBatchCampaignResults>>
>;
type CampaignResultsCall = CampaignResults["outboundCalls"][number];
type ResultsColumn = {
  header: string;
  value: (call: CampaignResultsCall) => unknown;
};

const excludedSourceColumns = new Set([
  "phone_number",
  "phonenumber",
  "phone",
  "language",
  "voice_id",
  "voiceid",
  "first_message",
  "firstmessage",
  "prompt",
  "system_prompt",
  "systemprompt",
]);

export function buildBatchCampaignResultsCsv(campaign: CampaignResults) {
  const calls = [...campaign.outboundCalls].sort(compareCampaignResultsCalls);
  const sourceKeys = orderedUnique(
    calls.flatMap((call) => Object.keys(sourceValues(call))),
  ).filter((key) => !excludedSourceColumns.has(normalizeKey(key)));
  const questionKeys = sourceKeys
    .filter(isQuestionKey)
    .sort(compareQuestionKeys);
  const nonQuestionSourceKeys = sourceKeys.filter((key) => !isQuestionKey(key));
  const extractedKeys = orderedUnique(
    calls.flatMap((call) => Array.from(extractedValues(call).keys())),
  );
  const evaluationKeys = orderedUnique(
    calls.flatMap((call) => Array.from(evaluationValues(call).keys())),
  );
  const usedExtractedKeys = new Set<string>();
  const columns: ResultsColumn[] = [];
  const usedHeaders = new Set<string>();

  const addColumn = (header: string, value: ResultsColumn["value"]) => {
    const uniqueHeader = uniqueCsvHeader(header, usedHeaders);
    columns.push({ header: uniqueHeader, value });
  };

  addColumn("row_number", (call) => rowNumber(call));
  addColumn("phone_number", (call) => call.phoneNumber);
  addColumn("outbound_status", (call) => call.status);
  addColumn("call_status", (call) => call.callLog?.status ?? "");
  addColumn("call_id", (call) => call.callLog?.callId ?? "");
  addColumn("outbound_id", (call) => call.outboundId);
  addColumn("duration_seconds", (call) => call.callLog?.durationSeconds ?? "");
  addColumn("failure_reason", (call) => failureReason(call));
  addColumn("started_at", (call) =>
    toIsoString(call.callLog?.startTime ?? null),
  );
  addColumn("ended_at", (call) => toIsoString(call.callLog?.endTime ?? null));

  for (const key of nonQuestionSourceKeys) {
    addColumn(key, (call) => sourceValues(call)[key] ?? "");
  }

  for (const key of questionKeys) {
    const answerHeader = `${key}_answer`;
    for (const matchedKey of matchingQuestionAnswerKeys(key, extractedKeys)) {
      usedExtractedKeys.add(matchedKey);
    }
    addColumn(key, (call) => sourceValues(call)[key] ?? "");
    addColumn(answerHeader, (call) => {
      const answer = questionAnswer(call, key);
      return answer?.value ?? "";
    });
  }

  for (const key of extractedKeys) {
    if (usedExtractedKeys.has(key)) continue;
    addColumn(key, (call) => extractedValues(call).get(key) ?? "");
  }

  for (const key of evaluationKeys) {
    addColumn(
      `evaluation_${key}`,
      (call) => evaluationValues(call).get(key) ?? "",
    );
  }

  return [
    columns.map((column) => column.header),
    ...calls.map((call) => columns.map((column) => column.value(call))),
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

function dispatchDelay(scheduledAt: Date | null, now: Date) {
  if (!scheduledAt) return 0;
  return Math.max(0, scheduledAt.getTime() - now.getTime());
}

function compareCampaignResultsCalls(
  left: CampaignResultsCall,
  right: CampaignResultsCall,
) {
  const leftRow = rowNumber(left);
  const rightRow = rowNumber(right);
  if (leftRow !== null && rightRow !== null && leftRow !== rightRow) {
    return leftRow - rightRow;
  }
  if (leftRow !== null && rightRow === null) return -1;
  if (leftRow === null && rightRow !== null) return 1;
  return left.createdAt.getTime() - right.createdAt.getTime();
}

function sourceValues(call: CampaignResultsCall): Record<string, unknown> {
  const optionalData = jsonObject(call.optionalData);
  const raw = jsonObject(optionalData.raw);
  const dynamicVariables = jsonObject(
    optionalData.dynamicVariables ?? optionalData.dynamic_variables,
  );
  return { ...raw, ...dynamicVariables };
}

function extractedValues(call: CampaignResultsCall) {
  return namedJsonValues(call.callLog?.dataExtracted, "name");
}

function evaluationValues(call: CampaignResultsCall) {
  return namedJsonValues(call.callLog?.dataEvaluation, "identifier");
}

function namedJsonValues(
  value: Prisma.JsonValue | null | undefined,
  preferredKey: "name" | "identifier",
) {
  const values = new Map<string, string>();

  if (Array.isArray(value)) {
    for (const item of value) {
      const record = jsonObject(item);
      const name =
        stringValue(record[preferredKey]) ??
        stringValue(record.name) ??
        stringValue(record.identifier) ??
        stringValue(record.field) ??
        stringValue(record.type);
      if (!name) continue;
      values.set(name, stringifyCsvValue(record.value));
    }
    return values;
  }

  for (const [key, entry] of Object.entries(jsonObject(value))) {
    values.set(key, stringifyCsvValue(entry));
  }
  return values;
}

function questionAnswer(call: CampaignResultsCall, questionKey: string) {
  const extracted = extractedValues(call);
  const normalizedEntries = new Map(
    Array.from(extracted.keys()).map((key) => [normalizeKey(key), key]),
  );

  for (const candidate of questionAnswerCandidates(questionKey)) {
    const matchedKey = normalizedEntries.get(normalizeKey(candidate));
    if (matchedKey) {
      return {
        matchedKey,
        value: extracted.get(matchedKey) ?? "",
      };
    }
  }
  return null;
}

function matchingQuestionAnswerKeys(
  questionKey: string,
  extractedKeys: string[],
) {
  const normalizedEntries = new Map(
    extractedKeys.map((key) => [normalizeKey(key), key]),
  );
  return questionAnswerCandidates(questionKey)
    .map((candidate) => normalizedEntries.get(normalizeKey(candidate)))
    .filter((key): key is string => Boolean(key));
}

function questionAnswerCandidates(questionKey: string) {
  const questionNumber = questionIndex(questionKey);
  return [
    `${questionKey}_answer`,
    `${questionKey}_response`,
    questionNumber ? `question_${questionNumber}_answer` : "",
    questionNumber ? `question_${questionNumber}_response` : "",
    questionNumber ? `answer_${questionNumber}` : "",
    questionNumber ? `response_${questionNumber}` : "",
    questionNumber ? `q${questionNumber}_answer` : "",
    questionNumber ? `q${questionNumber}_response` : "",
  ].filter(Boolean);
}

function rowNumber(call: CampaignResultsCall) {
  const optionalData = jsonObject(call.optionalData);
  const value = optionalData.rowNumber ?? optionalData.row_number;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function failureReason(call: CampaignResultsCall) {
  const optionalData = jsonObject(call.optionalData);
  return (
    stringValue(optionalData.failureReason) ??
    stringValue(optionalData.importError) ??
    ""
  );
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function orderedUnique(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isQuestionKey(key: string) {
  return questionIndex(key) !== null;
}

function questionIndex(key: string) {
  const match = /^question[_\s-]*(\d+)$/i.exec(key.trim());
  return match ? Number(match[1]) : null;
}

function compareQuestionKeys(left: string, right: string) {
  return (questionIndex(left) ?? 0) - (questionIndex(right) ?? 0);
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function uniqueCsvHeader(header: string, usedHeaders: Set<string>) {
  let candidate = header || "column";
  let suffix = 2;
  while (usedHeaders.has(candidate)) {
    candidate = `${header}_${suffix}`;
    suffix += 1;
  }
  usedHeaders.add(candidate);
  return candidate;
}

function csvEscape(value: unknown) {
  const text = stringifyCsvValue(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function stringifyCsvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeFilename(value: string) {
  const filename = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return filename || "campaign";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : "";
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
  organizationId: string,
) {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") return false;
  const prefix = `outbound-batches/${organizationId}/`;
  if (!key.startsWith(prefix)) return false;
  const objectName = key.slice(prefix.length);
  return new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${extension}$`,
    "i",
  ).test(objectName);
}

function readPositiveInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}
