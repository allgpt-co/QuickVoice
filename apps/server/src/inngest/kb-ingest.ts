import type { InngestFunction } from "inngest";

import { inngest } from "../config/inngest.js";
import { generateDownloadUrl } from "../config/s3.js";
import * as kbRepository from "../modules/kb/kb.repository.js";

// Triggered when new knowledge sources are created. Sends the documents to
// the ingestion lambda for Pinecone processing, then updates KB status
// to ACTIVE (+ increments agent count) on success or ERROR on failure.
export const kbIngest: InngestFunction.Any = inngest.createFunction(
  {
    id: "kb-ingest-documents",
    retries: 3,
    triggers: { event: "kb/documents.created" },
  },
  async ({ event, step }) => {
    const { agentId, organizationId, documents } = event.data;
    const kbIds = documents.map((doc: { id: string }) => doc.id);
    const lambdaUrl = process.env.KB_OPS_URL;
    if (!lambdaUrl) {
      console.warn("[kb-ingest] KB_OPS_URL not set, skipping ingestion");
      if (kbIds.length > 0) {
        await step.run("mark-error-no-url", () =>
          kbRepository.markError(kbIds, {
            code: "KB_PROCESSING_NOT_CONFIGURED",
            userMessage:
              "Knowledge processing is not configured for this workspace. Contact your workspace administrator.",
            retryable: false,
          }),
        );
      }
      return { success: false, reason: "KB_OPS_URL not configured" };
    }

    try {
      // For docs with an s3Key, generate a presigned download URL so the
      // lambda can fetch the file directly from S3 without needing credentials.
      const enrichedDocs = await step.run("generate-presigned-urls", async () => {
        return Promise.all(
          (documents as { id: string; s3Key?: string | null; [k: string]: unknown }[]).map(
            async (doc) => {
              if (doc.s3Key) {
                const url = await generateDownloadUrl(doc.s3Key);
                return { ...doc, url };
              }
              return doc;
            }
          )
        );
      });

      await step.run("send-to-ingestion-lambda", async () => {
        const res = await fetch(`${lambdaUrl}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, organizationId, documents: enrichedDocs }),
        });

        const body = await res.text();

        if (!res.ok) {
          throw new Error(
            `Ingestion lambda returned ${res.status}: ${body}`
          );
        }

        return { status: res.status };
      });

      // TODO:add store logic
      // Lambda succeeded — mark all sources as ACTIVE and increment agent count.
      if (kbIds.length > 0) {
        await step.run("mark-active", () =>
          kbRepository.markActive(kbIds, agentId)
        );
      }

      return { success: true };
    } catch (err) {
      // All retries exhausted — mark sources as ERROR.
      if (kbIds.length > 0) {
        await step.run("mark-error", () =>
          kbRepository.markError(kbIds, {
            code: "KB_PROCESSING_UNAVAILABLE",
            userMessage:
              "The knowledge processing service was unavailable. Try uploading the document again. If it still fails, contact your workspace administrator.",
            retryable: true,
          }),
        );
      }
      throw err;
    }
  }
);
