import { randomUUID } from "node:crypto";

import { kbStatus } from "../../../prisma/generated/prisma/client.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { assertSafeRemoteUrl } from "../../lib/url-safety.js";
import type { KbJobData, KbJobName } from "../../queues/kb.queue.js";
import { getKbQueue } from "../../queues/kb.queue.js";
import { cleanupKnowledgeSourceAssets } from "./kb-assets.service.js";
import { isValidKbStorageKey } from "./kb-file-policy.js";
import { createQueuedKbMetadata } from "./kb-job-metadata.js";
import * as kbRepository from "./kb.repository.js";
import type { CreateKbArgs, ListKbArgs, UpdateKbArgs } from "./kb.schema.js";

type KbQueueLike = {
  add: (
    name: KbJobName,
    data: KbJobData,
    options?: { jobId?: string },
  ) => Promise<unknown>;
  addBulk: (
    jobs: Array<{
      name: KbJobName;
      data: KbJobData;
      opts?: { jobId?: string };
    }>,
  ) => Promise<unknown>;
};

type CreateKnowledgeSourcesDependencies = {
  createJobId?: () => string;
  queue?: KbQueueLike;
  repository?: Pick<
    typeof kbRepository,
    "createKnowledgeSources" | "markError"
  >;
};

type RetryKnowledgeSourceDependencies = {
  createJobId?: () => string;
  queue?: Pick<KbQueueLike, "add">;
  repository?: Pick<
    typeof kbRepository,
    "claimRetry" | "getByIdForOrg" | "markError"
  >;
};

export const createKnowledgeSources = async (
  args: CreateKbArgs,
  dependencies: CreateKnowledgeSourcesDependencies = {},
) => {
  const repository = dependencies.repository ?? kbRepository;
  const createJobId = dependencies.createJobId ?? newKbJobId;

  if (!args.agentId) {
    throw new BadRequestError(
      "An agent must be selected — KB sources require an agent for vector storage",
    );
  }
  await Promise.all(
    args.documents
      .filter((doc) => doc.sourceType === "URL" && typeof doc.url === "string")
      .map((doc) => assertSafeRemoteUrl(doc.url as string)),
  );
  for (const document of args.documents) {
    if (
      document.sourceType !== "URL" &&
      (!document.s3Key ||
        !isValidKbStorageKey(
          document.s3Key,
          args.organizationId,
          document.sourceType,
        ))
    ) {
      throw new BadRequestError(
        "File reference is invalid for the active organization or source type",
      );
    }
  }

  const jobIds = args.documents.map(() => createJobId());
  const { rows, docs } = await repository.createKnowledgeSources(args, jobIds);
  const jobs = rows.map((row, index) => ({
    name: "process" as const,
    data: {
      kbIds: [row.kbId],
      agentId: args.agentId,
      organizationId: args.organizationId,
      documents: [
        {
          kbId: row.kbId,
          name: docs[index]!.name,
          sourceType: row.sourceType,
          url: docs[index]!.url ?? null,
          s3Key: docs[index]!.s3Key ?? null,
          originalFileName: args.documents[index]?.originalFileName ?? null,
        },
      ],
    },
    opts: { jobId: jobIds[index] },
  }));

  try {
    const queue = dependencies.queue ?? getKbQueue();
    await queue.addBulk(jobs);
  } catch (error) {
    await Promise.all(
      rows.map((row, index) =>
        repository.markError(
          [row.kbId],
          "The document could not be queued for processing.",
          jobIds[index],
          args.organizationId,
        ),
      ),
    );
    throw error;
  }

  return rows;
};

export const listKnowledgeSources = async (args: ListKbArgs) => {
  return kbRepository.listByOrg(args);
};

export const updateKnowledgeSource = async (args: UpdateKbArgs) => {
  const source = await kbRepository.getByIdForOrg(
    args.kbId,
    args.organizationId,
  );
  if (!source) {
    throw new NotFoundError("Knowledge source not found");
  }

  if (source.status === "PROCESSING") {
    throw new BadRequestError(
      "Wait for document processing to finish before editing this entry",
    );
  }

  if (source.sourceType !== "URL" && args.url !== undefined) {
    throw new BadRequestError(
      "Only URL knowledge sources have an editable URL",
    );
  }

  const name = args.name?.trim() ?? source.name;
  const agentId = args.agentId ?? source.agentId;
  if (!agentId) {
    throw new BadRequestError("An agent must be selected");
  }

  const storagePath =
    source.sourceType === "URL"
      ? (args.url?.trim() ?? source.storagePath)
      : source.storagePath;

  if (source.sourceType === "URL") {
    await assertSafeRemoteUrl(storagePath);
  }

  const changed =
    name !== source.name ||
    agentId !== source.agentId ||
    storagePath !== source.storagePath;
  if (!changed) return source;

  const jobId = newKbJobId();
  const updated = await kbRepository.prepareKnowledgeSourceUpdate({
    kbId: source.kbId,
    organizationId: args.organizationId,
    name,
    agentId,
    storagePath,
    jobId,
  });
  if (!updated) {
    throw new NotFoundError("Knowledge source not found");
  }

  try {
    await getKbQueue().add(
      "process",
      {
        kbIds: [updated.row.kbId],
        agentId,
        organizationId: args.organizationId,
        replaceExisting: true,
        previousAgentId: updated.previousAgentId,
        documents: [
          {
            kbId: updated.row.kbId,
            name: updated.row.name,
            sourceType: updated.row.sourceType,
            url:
              updated.row.sourceType === "URL" ? updated.row.storagePath : null,
            s3Key:
              updated.row.sourceType === "URL" ? null : updated.row.storagePath,
            originalFileName: updated.row.originalFileName,
          },
        ],
      },
      { jobId },
    );
  } catch (error) {
    await kbRepository.markError(
      [updated.row.kbId],
      "The document could not be queued for processing.",
      jobId,
      args.organizationId,
    );
    throw error;
  }

  return updated.row;
};

export const deleteKnowledgeSource = async (
  organizationId: string,
  kbId: string,
) => {
  const source = await kbRepository.getByIdForOrg(kbId, organizationId);
  if (!source) {
    throw new NotFoundError("Knowledge source not found");
  }
  await cleanupKnowledgeSourceAssets(source);

  const deleted = await kbRepository.deleteKnowledgeSource(
    kbId,
    organizationId,
  );
  return deleted;
};

export const retryKnowledgeSource = async (
  organizationId: string,
  kbId: string,
  dependencies: RetryKnowledgeSourceDependencies = {},
) => {
  const repository = dependencies.repository ?? kbRepository;
  const createJobId = dependencies.createJobId ?? newKbJobId;
  const source = await repository.getByIdForOrg(kbId, organizationId);

  if (!source) {
    throw new NotFoundError("Knowledge source not found");
  }
  if (source.status !== kbStatus.ERROR) {
    throw new BadRequestError("Only failed knowledge sources can be retried");
  }
  const previousMetadata = asRecord(source.metadata);
  if (previousMetadata.retryable === false) {
    throw new BadRequestError(
      "This knowledge source cannot be retried; upload a corrected document instead",
    );
  }
  if (!source.agentId) {
    throw new BadRequestError(
      "The knowledge source must be assigned to an agent before retrying",
    );
  }

  if (source.sourceType === "URL") {
    await assertSafeRemoteUrl(source.storagePath);
  } else if (
    !isValidKbStorageKey(source.storagePath, organizationId, source.sourceType)
  ) {
    throw new BadRequestError(
      "The stored file reference is no longer valid for this organization",
    );
  }

  const previousJobId = asNonEmptyString(previousMetadata.jobId);
  const retryCount = asNonNegativeInteger(previousMetadata.retryCount) + 1;
  const jobId = createJobId();
  const metadata = createQueuedKbMetadata(jobId, {
    retryCount,
    retryOfJobId: previousJobId,
  });
  const claimed = await repository.claimRetry(kbId, organizationId, metadata);

  if (!claimed) {
    throw new BadRequestError(
      "This knowledge source is already queued or no longer failed",
    );
  }

  const data: KbJobData = {
    kbIds: [kbId],
    agentId: source.agentId,
    organizationId,
    documents: [
      {
        kbId,
        name: source.name,
        sourceType: source.sourceType,
        url: source.sourceType === "URL" ? source.storagePath : null,
        s3Key: source.sourceType === "URL" ? null : source.storagePath,
        originalFileName: source.originalFileName,
      },
    ],
  };

  try {
    const queue = dependencies.queue ?? getKbQueue();
    await queue.add("process", data, { jobId });
  } catch (error) {
    await repository.markError(
      [kbId],
      "The document could not be queued for processing.",
      jobId,
      organizationId,
    );
    throw error;
  }

  return {
    ...source,
    status: kbStatus.PROCESSING,
    metadata,
  };
};

function newKbJobId() {
  return `kb-${randomUUID()}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}
