import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";

import { parseBatchRecipients } from "../../src/modules/outbound/outbound-batch-parser.js";

test("parseBatchRecipients maps CSV columns to overrides and dynamic variables", () => {
  const csv = [
    "phone_number,language,voice_id,first_message,prompt,city,other_dyn_variable",
    "+15550001111,en-US,aura-2-athena-en,Hi Sam,Keep this call short.,Austin,renewal",
    "+15550002222,,,Hello Pat,,Dallas,priority",
  ].join("\n");

  const result = parseBatchRecipients(Buffer.from(csv), "recipients.csv");

  assert.equal(result.validRows.length, 2);
  assert.equal(result.invalidRows.length, 0);
  assert.deepEqual(result.headers, [
    "phone_number",
    "language",
    "voice_id",
    "first_message",
    "prompt",
    "city",
    "other_dyn_variable",
  ]);
  assert.deepEqual(result.validRows[0], {
    rowNumber: 2,
    recipientKey: "+15550001111",
    phoneNumber: "+15550001111",
    language: "en-US",
    voiceId: "aura-2-athena-en",
    firstMessage: "Hi Sam",
    systemPrompt: "Keep this call short.",
    dynamicVariables: {
      city: "Austin",
      other_dyn_variable: "renewal",
    },
    values: {
      city: "Austin",
      other_dyn_variable: "renewal",
    },
  });
  assert.deepEqual(result.validRows[1], {
    rowNumber: 3,
    recipientKey: "+15550002222",
    phoneNumber: "+15550002222",
    language: null,
    voiceId: null,
    firstMessage: "Hello Pat",
    systemPrompt: null,
    dynamicVariables: {
      city: "Dallas",
      other_dyn_variable: "priority",
    },
    values: {
      city: "Dallas",
      other_dyn_variable: "priority",
    },
  });
});

test("parseBatchRecipients handles quoted CSV values", () => {
  const csv = [
    "phone_number,first_message,city",
    "+15550001111,\"Hello, Sam\",\"Austin \"\"HQ\"\"\"",
  ].join("\n");

  const result = parseBatchRecipients(Buffer.from(csv), "recipients.csv");

  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0]?.firstMessage, "Hello, Sam");
  assert.deepEqual(result.validRows[0]?.dynamicVariables, {
    city: "Austin \"HQ\"",
  });
});

test("parseBatchRecipients maps XLSX columns to overrides and dynamic variables", () => {
  const workbook = createXlsx([
    ["phone_number", "language", "voice_id", "first_message", "prompt", "city"],
    [
      "+15550001111",
      "hi-IN",
      "aura-2-athena-en",
      "Hi {{city}}",
      "Prompt {{city}}",
      "Mumbai",
    ],
  ]);

  const result = parseBatchRecipients(workbook, "recipients.xlsx");

  assert.equal(result.validRows.length, 1);
  assert.deepEqual(result.validRows[0], {
    rowNumber: 2,
    recipientKey: "+15550001111",
    phoneNumber: "+15550001111",
    language: "hi-IN",
    voiceId: "aura-2-athena-en",
    firstMessage: "Hi {{city}}",
    systemPrompt: "Prompt {{city}}",
    dynamicVariables: {
      city: "Mumbai",
    },
    values: {
      city: "Mumbai",
    },
  });
});

test("parseBatchRecipients returns invalid rows for missing phone numbers", () => {
  const csv = [
    "phone_number,language,voice_id,first_message,prompt,city,other_dyn_variable",
    ",en-US,aura-2-athena-en,Hi,Prompt,Austin,value",
  ].join("\n");

  const result = parseBatchRecipients(Buffer.from(csv), "recipients.csv");

  assert.equal(result.validRows.length, 0);
  assert.deepEqual(result.invalidRows, [
    {
      rowNumber: 2,
      phoneNumber: "",
      error: "phone_number is required",
      raw: {
        phone_number: "",
        language: "en-US",
        voice_id: "aura-2-athena-en",
        first_message: "Hi",
        prompt: "Prompt",
        city: "Austin",
        other_dyn_variable: "value",
      },
    },
  ]);
});

test("parseBatchRecipients rejects legacy XLS files", () => {
  assert.throws(
    () => parseBatchRecipients(Buffer.from("not xls"), "recipients.xls"),
    /Legacy XLS files are not supported/
  );
});

function createXlsx(rows: string[][]) {
  const sharedStrings: string[] = [];
  const sharedStringIndexes = new Map<string, number>();
  const cellRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          let sharedStringIndex = sharedStringIndexes.get(value);
          if (sharedStringIndex === undefined) {
            sharedStringIndex = sharedStrings.length;
            sharedStrings.push(value);
            sharedStringIndexes.set(value, sharedStringIndex);
          }
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${reference}" t="s"><v>${sharedStringIndex}</v></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Recipients" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cellRows}</sheetData></worksheet>`
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")}</sst>`
    ),
  };

  return Buffer.from(zipSync(entries));
}

function columnName(index: number) {
  let column = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\x27/g, "&apos;");
}
