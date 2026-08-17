import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestError } from "../../src/common/errors/badRequest.js";
import {
  inspectKbUpload,
  isValidKbStorageKey,
} from "../../src/modules/kb/kb-file-policy.js";
import { createKbUploadUrl } from "../../src/modules/kb/kb-upload.service.js";

const TEST_UUID = "8d55565f-1111-4111-8111-f95fd03f0df2";

test("KB upload signing normalizes supported files and binds content length", async () => {
  const calls: unknown[][] = [];
  const result = await createKbUploadUrl(
    {
      organizationId: "org_123",
      fileName: "quarterly-results.CSV",
      contentType: "text/csv; charset=utf-8",
      fileSize: 12_345,
    },
    {
      maxUploadBytes: 20_000,
      randomUUIDImpl: () => TEST_UUID,
      generateUploadUrlImpl: async (...args) => {
        calls.push(args);
        return "https://storage.example/upload";
      },
    }
  );

  assert.deepEqual(calls, [
    [
      `kb/org_123/${TEST_UUID}.csv`,
      "text/csv",
      12_345,
    ],
  ]);
  assert.deepEqual(result, {
    uploadUrl: "https://storage.example/upload",
    s3Key: `kb/org_123/${TEST_UUID}.csv`,
    sourceType: "CSV",
    contentType: "text/csv",
    maxUploadBytes: 20_000,
  });
});

test("KB upload signing rejects mismatched types and oversized files", async () => {
  await assert.rejects(
    createKbUploadUrl(
      {
        organizationId: "org_123",
        fileName: "payload.exe",
        contentType: "application/octet-stream",
        fileSize: 100,
      },
      { maxUploadBytes: 1_000 }
    ),
    BadRequestError
  );

  await assert.rejects(
    createKbUploadUrl(
      {
        organizationId: "org_123",
        fileName: "manual.pdf",
        contentType: "text/plain",
        fileSize: 100,
      },
      { maxUploadBytes: 1_000 }
    ),
    BadRequestError
  );

  await assert.rejects(
    createKbUploadUrl(
      {
        organizationId: "org_123",
        fileName: "manual.pdf",
        contentType: "application/pdf",
        fileSize: 1_001,
      },
      { maxUploadBytes: 1_000 }
    ),
    /upload limit/
  );
});

test("KB file references must use the active organization and matching source type", () => {
  const key = `kb/org_123/${TEST_UUID}.pdf`;

  assert.equal(isValidKbStorageKey(key, "org_123", "PDF"), true);
  assert.equal(isValidKbStorageKey(key, "org_other", "PDF"), false);
  assert.equal(isValidKbStorageKey(key, "org_123", "TXT"), false);
  assert.equal(
    isValidKbStorageKey("kb/org_123/not-a-server-id.pdf", "org_123", "PDF"),
    false
  );
  assert.equal(inspectKbUpload("notes.txt", "text/plain")?.sourceType, "TXT");
});
