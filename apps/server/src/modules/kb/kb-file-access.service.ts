import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";

import { BadRequestError } from "../../common/errors/badRequest.js";
import CustomApiError from "../../common/errors/customApiError.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { generateDownloadUrl, readObjectStream } from "../../config/s3.js";
import { isValidKbStorageKey } from "./kb-file-policy.js";
import * as repository from "./kb.repository.js";

const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  PDF: "application/pdf",
  TXT: "text/plain; charset=utf-8",
  CSV: "text/plain; charset=utf-8",
};

export async function getKbFile(
  organizationId: string,
  kbId: string,
  disposition: "inline" | "attachment",
  dependencies: {
    getByIdForOrg?: typeof repository.getByIdForOrg;
  } = {},
) {
  const source = await (dependencies.getByIdForOrg ?? repository.getByIdForOrg)(kbId, organizationId);
  if (!source || source.organizationId !== organizationId) {
    throw new NotFoundError("Knowledge source not found");
  }
  if (source.sourceType === "URL") {
    throw new BadRequestError("URL knowledge sources do not have an uploaded file");
  }
  if (!isValidKbStorageKey(source.storagePath, organizationId, source.sourceType)) {
    throw new NotFoundError("Knowledge file not found");
  }
  if (disposition === "inline" && !PREVIEW_CONTENT_TYPES[source.sourceType]) {
    throw new BadRequestError("Preview is not available for this file type; download it instead");
  }

  const extension = source.sourceType.toLowerCase();
  const originalName = source.originalFileName ?? source.name;
  const stem = originalName.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_").trim().slice(0, 100) || "knowledge-source";
  return {
    storagePath: source.storagePath,
    fileName: `${stem}.${extension}`,
    contentType: disposition === "inline"
      ? PREVIEW_CONTENT_TYPES[source.sourceType]!
      : "application/octet-stream",
  };
}

// Retained for older consoles during a rolling deployment.
export async function getKbFileUrl(
  organizationId: string,
  kbId: string,
  disposition: "inline" | "attachment",
  dependencies: Parameters<typeof getKbFile>[3] & { signer?: typeof generateDownloadUrl } = {},
) {
  const file = await getKbFile(organizationId, kbId, disposition, dependencies);
  return (dependencies.signer ?? generateDownloadUrl)(
    file.storagePath, 300, file.fileName, disposition,
    disposition === "inline" ? file.contentType : undefined,
  );
}

export async function streamKbFile(
  organizationId: string,
  kbId: string,
  disposition: "inline" | "attachment",
  response: Response,
  dependencies: Parameters<typeof getKbFile>[3] & { reader?: typeof readObjectStream } = {},
) {
  const file = await getKbFile(organizationId, kbId, disposition, dependencies);
  const cancellation = new AbortController();
  const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(30_000)]);
  const cancel = () => cancellation.abort();
  response.once("close", cancel);
  let body: Awaited<ReturnType<typeof readObjectStream>>["body"] | undefined;
  try {
    if (response.destroyed) return;
    const object = await (dependencies.reader ?? readObjectStream)(file.storagePath, signal);
    body = object.body;
    const maxBytes = 10 * 1024 * 1024; // Matches the maximum supported KB upload size.
    if (object.contentLength !== undefined && object.contentLength > maxBytes) {
      throw new CustomApiError("Document exceeds the 10 MB viewing and download limit", 413);
    }
    response.set({
      "Content-Type": file.contentType,
      "Content-Disposition": `${disposition}; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done(bytes > maxBytes ? new Error("Document exceeds the maximum size") : null, chunk);
      },
    });
    await pipeline(body, limit, response, { signal });
  } catch (error) {
    if (response.destroyed || response.headersSent) {
      response.destroy();
      return;
    }
    if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) {
      throw new NotFoundError("Knowledge file not found");
    }
    if (signal.aborted) throw new CustomApiError("Document request timed out; please try again", 504);
    throw error;
  } finally {
    response.off("close", cancel);
    cancellation.abort();
    body?.destroy();
  }
}
