import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { generateDownloadUrl } from "../../config/s3.js";
import { isValidKbStorageKey } from "./kb-file-policy.js";
import * as repository from "./kb.repository.js";

const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  PDF: "application/pdf",
  TXT: "text/plain; charset=utf-8",
  CSV: "text/plain; charset=utf-8",
};

export async function getKbFileUrl(
  organizationId: string,
  kbId: string,
  disposition: "inline" | "attachment",
  dependencies: {
    getByIdForOrg?: typeof repository.getByIdForOrg;
    signer?: typeof generateDownloadUrl;
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
  return (dependencies.signer ?? generateDownloadUrl)(
    source.storagePath,
    300,
    `${stem}.${extension}`,
    disposition,
    disposition === "inline" ? PREVIEW_CONTENT_TYPES[source.sourceType] : undefined,
  );
}
