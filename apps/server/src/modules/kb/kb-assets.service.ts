import { deleteObject } from "../../config/s3.js";
import CustomApiError from "../../common/errors/customApiError.js";
import { deleteKbDocumentVectors } from "./kb-processing-client.js";

type KnowledgeSourceAssets = {
  kbId: string;
  agentId: string | null;
  storagePath: string;
  sourceType: string;
};

type CleanupKnowledgeSourceDeps = {
  aiApiUrl?: string;
  deleteObjectImpl?: typeof deleteObject;
  fetchImpl?: typeof fetch;
  internalApiKey?: string;
};

export async function cleanupKnowledgeSourceAssets(
  source: KnowledgeSourceAssets,
  deps: CleanupKnowledgeSourceDeps = {},
) {
  const deleteObjectImpl = deps.deleteObjectImpl ?? deleteObject;
  const fetchImpl = deps.fetchImpl ?? fetch;
  // Keep the source file available until vector cleanup succeeds.

  if (source.agentId) {
    const aiApiUrl =
      deps.aiApiUrl ?? process.env.AI_API_URL ?? "http://localhost:5555";
    const internalApiKey =
      deps.internalApiKey ?? process.env.INTERNAL_API_KEY?.trim();
    if (!internalApiKey) {
      throw new CustomApiError(
        "Knowledge deletion is unavailable: internal AI authentication is not configured.",
        503,
        { code: "KB_CLEANUP_NOT_CONFIGURED" },
      );
    }
    await deleteKbDocumentVectors({
      aiApiUrl,
      internalApiKey,
      agentId: source.agentId,
      kbId: source.kbId,
      fetchImpl,
    });
  }

  if (source.sourceType !== "URL" && source.storagePath) {
    try {
      await deleteObjectImpl(source.storagePath);
    } catch {
      throw new CustomApiError(
        "The knowledge file could not be removed from storage. Check storage access and retry deletion.",
        502,
        { code: "KB_STORAGE_CLEANUP_FAILED" },
      );
    }
  }
}
