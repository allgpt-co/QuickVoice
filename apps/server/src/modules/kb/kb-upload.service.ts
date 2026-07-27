import { randomUUID } from "node:crypto";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { generateUploadUrl } from "../../config/s3.js";
import { inspectKbUpload } from "./kb-file-policy.js";

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_CONFIGURABLE_UPLOAD_BYTES = 100 * 1024 * 1024;

type CreateKbUploadUrlArgs = {
  contentType: string;
  fileName: string;
  fileSize: number;
  organizationId: string;
};

type CreateKbUploadUrlDependencies = {
  generateUploadUrlImpl?: typeof generateUploadUrl;
  maxUploadBytes?: number;
  randomUUIDImpl?: typeof randomUUID;
};

export async function createKbUploadUrl(
  args: CreateKbUploadUrlArgs,
  dependencies: CreateKbUploadUrlDependencies = {}
) {
  const file = inspectKbUpload(args.fileName, args.contentType);
  if (!file) {
    throw new BadRequestError(
      "Unsupported file type. Upload PDF, DOCX, TXT, CSV, XLSX, or XLS files."
    );
  }

  const maxUploadBytes =
    dependencies.maxUploadBytes ?? readMaxUploadBytes();
  if (args.fileSize > maxUploadBytes) {
    throw new BadRequestError(
      `File exceeds the ${formatMegabytes(maxUploadBytes)} MB upload limit`
    );
  }

  const createId = dependencies.randomUUIDImpl ?? randomUUID;
  const s3Key = `kb/${args.organizationId}/${createId()}.${file.extension}`;
  const createUploadUrl =
    dependencies.generateUploadUrlImpl ?? generateUploadUrl;
  const uploadUrl = await createUploadUrl(
    s3Key,
    file.contentType,
    args.fileSize
  );

  return {
    uploadUrl,
    s3Key,
    sourceType: file.sourceType,
    contentType: file.contentType,
    maxUploadBytes,
  };
}

function readMaxUploadBytes() {
  const value = Number(process.env.KB_MAX_UPLOAD_BYTES);
  return Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_CONFIGURABLE_UPLOAD_BYTES
    ? value
    : DEFAULT_MAX_UPLOAD_BYTES;
}

function formatMegabytes(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}
