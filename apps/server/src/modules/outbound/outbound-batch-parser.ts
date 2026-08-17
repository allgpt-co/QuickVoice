import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

const SPECIAL_COLUMNS = new Set([
  "phone_number",
  "language",
  "voice_id",
  "first_message",
  "prompt",
  "system_prompt",
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

export type ParsedBatchRecipient = {
  rowNumber: number;
  recipientKey: string;
  phoneNumber: string;
  language: string | null;
  voiceId: string | null;
  firstMessage: string | null;
  systemPrompt: string | null;
  dynamicVariables: Record<string, string>;
  values: Record<string, string>;
};

export type InvalidBatchRecipient = {
  rowNumber: number;
  phoneNumber: string;
  error: string;
  raw: Record<string, string>;
};

export type BatchParseResult = {
  headers: string[];
  validRows: ParsedBatchRecipient[];
  invalidRows: InvalidBatchRecipient[];
};

export function parseBatchRecipients(
  data: Buffer,
  fileName: string
): BatchParseResult {
  const rows = parseRows(data, fileName);
  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((value) => normalizeHeader(value));
  if (!headers.includes("phone_number")) {
    throw new Error("Recipient file must include a phone_number column");
  }

  const validRows: ParsedBatchRecipient[] = [];
  const invalidRows: InvalidBatchRecipient[] = [];

  rows.slice(1).forEach((row, index) => {
    const raw = rowToRecord(headers, row);
    if (isEmptyRecord(raw)) return;

    const rowNumber = index + 2;
    const phoneNumber = raw.phone_number ?? "";
    if (!phoneNumber.trim()) {
      invalidRows.push({
        rowNumber,
        phoneNumber,
        error: "phone_number is required",
        raw,
      });
      return;
    }

    if (phoneNumber.trim().length < 10) {
      invalidRows.push({
        rowNumber,
        phoneNumber,
        error: "phone_number must be at least 10 digits",
        raw,
      });
      return;
    }

    const trimmedPhone = phoneNumber.trim();
    const recipientKey = resolveRecipientKey(raw, trimmedPhone, rowNumber);

    validRows.push({
      rowNumber,
      recipientKey,
      phoneNumber: trimmedPhone,
      language: nullableTrim(raw.language),
      voiceId: nullableTrim(raw.voice_id),
      firstMessage: nullableTrim(raw.first_message),
      systemPrompt: nullableTrim(raw.prompt) ?? nullableTrim(raw.system_prompt),
      dynamicVariables: buildDynamicVariables(raw),
      values: buildRecipientValues(raw),
    });
  });

  return { headers, validRows, invalidRows };
}

function parseRows(data: Buffer, fileName: string) {
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith(".xlsx")) return parseXlsxRows(data);
  if (lowerFileName.endsWith(".xls")) {
    throw new Error("Legacy XLS files are not supported. Upload CSV or XLSX files.");
  }
  return parseCsvRows(data.toString("utf8").replace(/^\uFEFF/, ""));
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inQuotes) {
      if (char === "\"") {
        if (content[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      if (content[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

function parseXlsxRows(data: Buffer) {
  const files = unzipSync(new Uint8Array(data));
  const workbook = parseXml(readZipText(files, "xl/workbook.xml"));
  const workbookRoot = asRecord(workbook.workbook);
  const sheetsRoot = asRecord(workbookRoot.sheets);
  const sheet = asRecord(asArray(sheetsRoot.sheet)[0]);
  const relationshipId = stringValue(sheet["r:id"]);
  if (!relationshipId) {
    throw new Error("Recipient XLSX file does not contain a worksheet");
  }

  const relationships = parseXml(readZipText(files, "xl/_rels/workbook.xml.rels"));
  const relationshipsRoot = asRecord(relationships.Relationships);
  const worksheetRelationship = asArray(relationshipsRoot.Relationship)
    .map((relationship) => asRecord(relationship))
    .find((relationship) => stringValue(relationship.Id) === relationshipId);
  const target = stringValue(worksheetRelationship?.Target);
  if (!target) {
    throw new Error("Recipient XLSX worksheet relationship is missing");
  }

  const sharedStrings = parseSharedStrings(files);
  const worksheetPath = normalizeXlsxPath("xl", target);
  const worksheet = parseXml(readZipText(files, worksheetPath));
  const worksheetRoot = asRecord(worksheet.worksheet);
  const sheetData = asRecord(worksheetRoot.sheetData);
  const rows = asArray(sheetData.row).map((entry) => {
    const values: string[] = [];
    for (const cell of asArray(asRecord(entry).c)) {
      const cellRecord = asRecord(cell);
      const column = columnIndex(stringValue(cellRecord.r));
      values[column >= 0 ? column : values.length] = readCellValue(cellRecord, sharedStrings);
    }
    return values;
  });

  return rows.filter((entry) => entry.some((value) => (value ?? "").trim().length > 0));
}

function parseSharedStrings(files: Record<string, Uint8Array>) {
  const sharedStringsFile = files["xl/sharedStrings.xml"];
  if (!sharedStringsFile) return [];

  const parsed = parseXml(strFromU8(sharedStringsFile));
  const sst = asRecord(parsed.sst);
  return asArray(sst.si).map((item) => richText(item));
}

function readCellValue(cell: unknown, sharedStrings: string[]) {
  const record = asRecord(cell);
  const type = stringValue(record.t);
  if (type === "s") {
    const index = Number(valueText(record.v));
    return Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
  }
  if (type === "inlineStr") return richText(record.is);
  return valueText(record.v);
}

function richText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((entry) => richText(entry)).join("");

  const record = asRecord(value);
  if (record.t !== undefined) return valueText(record.t);
  if (record.r !== undefined) {
    return asArray(record.r).map((entry) => richText(entry)).join("");
  }
  if (record["#text"] !== undefined) return valueText(record["#text"]);
  return "";
}

function valueText(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    const record = asRecord(value);
    return String(record["#text"] ?? "");
  }
  return String(value);
}

function parseXml(xml: string) {
  return xmlParser.parse(xml) as Record<string, unknown>;
}

function readZipText(files: Record<string, Uint8Array>, filePath: string) {
  const file = files[filePath];
  if (!file) throw new Error(`Recipient XLSX file is missing ${filePath}`);
  return strFromU8(file);
}

function normalizeXlsxPath(basePath: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  return path.posix.normalize(`${basePath}/${target}`);
}

function columnIndex(cellReference: string | null) {
  const match = cellReference?.match(/^[A-Z]+/i);
  if (!match) return -1;

  let index = 0;
  for (const char of match[0].toUpperCase()) {
    index = index * 26 + char.charCodeAt(0) - 64;
  }
  return index - 1;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function rowToRecord(headers: string[], row: string[]) {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (!header) return;
    record[header] = String(row[index] ?? "").trim();
  });
  return record;
}

function isEmptyRecord(record: Record<string, string>) {
  return Object.values(record).every((value) => value.length === 0);
}

function resolveRecipientKey(
  raw: Record<string, string>,
  phoneNumber: string,
  rowNumber: number,
) {
  const explicitKey =
    raw.recipient_key ??
    raw.recipientId ??
    raw.recipientid ??
    raw.recipient;
  if (explicitKey?.trim()) return explicitKey.trim();
  return phoneNumber || `row_${rowNumber}`;
}

function nullableTrim(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildDynamicVariables(raw: Record<string, string>) {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SPECIAL_COLUMNS.has(key) || !value) continue;
    variables[key] = value;
  }
  return variables;
}

function buildRecipientValues(raw: Record<string, string>) {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SPECIAL_COLUMNS.has(key) || key.length === 0) continue;
    values[key] = value;
  }
  return values;
}
