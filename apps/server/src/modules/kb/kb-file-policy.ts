import { extname } from "node:path";

const FILE_POLICIES = {
  pdf: {
    sourceType: "PDF",
    contentTypes: ["application/pdf", "application/octet-stream"],
  },
  txt: {
    sourceType: "TXT",
    contentTypes: ["text/plain", "application/octet-stream"],
  },
  csv: {
    sourceType: "CSV",
    contentTypes: [
      "text/csv",
      "application/csv",
      "text/plain",
      "application/octet-stream",
    ],
  },
  docx: {
    sourceType: "DOCX",
    contentTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream",
    ],
  },
  xlsx: {
    sourceType: "XLSX",
    contentTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ],
  },
  xls: {
    sourceType: "XLS",
    contentTypes: [
      "application/vnd.ms-excel",
      "application/octet-stream",
    ],
  },
} as const;

export type KbFileSourceType =
  (typeof FILE_POLICIES)[keyof typeof FILE_POLICIES]["sourceType"];

export function inspectKbUpload(fileName: string, contentType: string) {
  const extension = normalizedExtension(fileName);
  const policy = extension
    ? FILE_POLICIES[extension as keyof typeof FILE_POLICIES]
    : undefined;
  const normalizedContentType = contentType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (
    !extension ||
    !policy ||
    !normalizedContentType ||
    !(policy.contentTypes as readonly string[]).includes(normalizedContentType)
  ) {
    return null;
  }

  return {
    extension,
    contentType: normalizedContentType,
    sourceType: policy.sourceType,
  };
}

export function isValidKbStorageKey(
  storageKey: string,
  organizationId: string,
  declaredSourceType: string
) {
  const prefix = `kb/${organizationId}/`;
  if (!storageKey.startsWith(prefix)) return false;

  const objectName = storageKey.slice(prefix.length);
  const extension = normalizedExtension(objectName);
  const policy = extension
    ? FILE_POLICIES[extension as keyof typeof FILE_POLICIES]
    : undefined;

  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(
      objectName
    ) && policy?.sourceType === declaredSourceType
  );
}

function normalizedExtension(fileName: string) {
  return extname(fileName).slice(1).toLowerCase();
}
