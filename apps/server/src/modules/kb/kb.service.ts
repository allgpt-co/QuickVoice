import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { assertSafeRemoteUrl } from "../../lib/url-safety.js";
import { deleteObject } from "../../config/s3.js";
import * as kbRepository from "./kb.repository.js";
import { kbQueue } from "../../queues/kb.queue.js";
import type {
  CreateKbArgs,
  ListKbArgs,
  UpdateKbArgs,
} from "./kb.schema.js";

export const createKnowledgeSources = async (args: CreateKbArgs) => {
  if (!args.agentId) {
    throw new BadRequestError("An agent must be selected — KB sources require an agent for vector storage");
  }
  await Promise.all(
    args.documents
      .filter((doc) => doc.sourceType === "URL" && typeof doc.url === "string")
      .map((doc) => assertSafeRemoteUrl(doc.url as string))
  );

  const { rows, docs } = await kbRepository.createKnowledgeSources(args);

  await kbQueue.add("process", {
    kbIds: rows.map((r) => r.kbId),
    agentId: args.agentId,
    organizationId: args.organizationId,
    documents: docs.map((d, i) => ({
      kbId: rows[i]!.kbId,
      name: d.name,
      sourceType: rows[i]!.sourceType,
      url: d.url ?? null,
      s3Key: d.s3Key ?? null,
      originalFileName: args.documents[i]?.originalFileName ?? null,
    })),
  });

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
    throw new BadRequestError("Only URL knowledge sources have an editable URL");
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

  const updated = await kbRepository.prepareKnowledgeSourceUpdate({
    kbId: source.kbId,
    organizationId: args.organizationId,
    name,
    agentId,
    storagePath,
  });
  if (!updated) {
    throw new NotFoundError("Knowledge source not found");
  }

  await kbQueue.add("process", {
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
        url: updated.row.sourceType === "URL" ? updated.row.storagePath : null,
        s3Key: updated.row.sourceType === "URL" ? null : updated.row.storagePath,
        originalFileName: updated.row.originalFileName,
      },
    ],
  });

  return updated.row;
};

export const deleteKnowledgeSource = async (
  organizationId: string,
  kbId: string
) => {
  const source = await kbRepository.getByIdForOrg(kbId, organizationId);
  if (!source) {
    throw new NotFoundError("Knowledge source not found");
  }
  await cleanupKnowledgeSourceAssets(source).catch((error) => {
    console.warn("[kb] failed to clean up knowledge source assets", {
      kbId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const deleted = await kbRepository.deleteKnowledgeSource(kbId, organizationId);
  return deleted;
};

async function cleanupKnowledgeSourceAssets(source: {
  kbId: string;
  organizationId: string;
  agentId: string | null;
  storagePath: string;
  sourceType: string;
}) {
  const cleanupTasks: Promise<unknown>[] = [];

  if (source.sourceType !== "URL" && source.storagePath) {
    cleanupTasks.push(deleteObject(source.storagePath));
  }

  const kbOpsUrl = process.env.KB_OPS_URL;
  if (kbOpsUrl) {
    cleanupTasks.push(
      fetch(`${kbOpsUrl.replace(/\/$/, "")}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId: source.kbId,
          organizationId: source.organizationId,
          agentId: source.agentId,
          storagePath: source.storagePath,
        }),
      }).then(async (response) => {
        if (!response.ok && response.status !== 404) {
          throw new Error(`KB cleanup returned ${response.status}`);
        }
      })
    );
  }

  await Promise.all(cleanupTasks);
}
