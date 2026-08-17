import { deleteObject } from "../../config/s3.js";

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
  deps: CleanupKnowledgeSourceDeps = {}
) {
  const deleteObjectImpl = deps.deleteObjectImpl ?? deleteObject;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cleanupTasks: Promise<unknown>[] = [];

  if (source.sourceType !== "URL" && source.storagePath) {
    cleanupTasks.push(deleteObjectImpl(source.storagePath));
  }

  if (source.agentId) {
    const aiApiUrl = deps.aiApiUrl ?? process.env.AI_API_URL ?? "http://localhost:5555";
    const internalApiKey =
      deps.internalApiKey ?? process.env.INTERNAL_API_KEY?.trim();
    if (!internalApiKey) {
      throw new Error("INTERNAL_API_KEY is required for KB vector cleanup");
    }
    cleanupTasks.push(
      fetchImpl(
        `${aiApiUrl.replace(/\/$/, "")}/kb/${encodeURIComponent(source.agentId)}/${encodeURIComponent(source.kbId)}`,
        {
          method: "DELETE",
          headers: { "x-internal-key": internalApiKey },
          signal: AbortSignal.timeout(10_000),
        }
      ).then(async (response) => {
        if (!response.ok && response.status !== 404) {
          throw new Error(`KB vector cleanup returned ${response.status}`);
        }
      })
    );
  }

  await Promise.all(cleanupTasks);
}
