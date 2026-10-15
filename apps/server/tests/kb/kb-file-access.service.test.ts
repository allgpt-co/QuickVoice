import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestError } from "../../src/common/errors/badRequest.js";
import { NotFoundError } from "../../src/common/errors/notFound.js";
import { getKbFileUrl } from "../../src/modules/kb/kb-file-access.service.js";

const source = {
  kbId: "kb-1",
  organizationId: "org-1",
  sourceType: "PDF",
  storagePath: "kb/org-1/8d55565f-1111-4111-8111-f95fd03f0df2.pdf",
  originalFileName: "C:\\uploads\\quarterly\"report\r\n.pdf",
  name: "Quarterly report",
};

test("KB file links are short-lived, scoped, and use a safe filename", async () => {
  const calls: unknown[][] = [];
  const dependencies = {
    getByIdForOrg: async (kbId: string, organizationId: string) => {
      assert.equal(kbId, "kb-1");
      assert.equal(organizationId, "org-1");
      return source as never;
    },
    signer: async (...args: unknown[]) => {
      calls.push(args);
      return "https://storage.example/signed";
    },
  } as never;

  assert.equal(await getKbFileUrl("org-1", "kb-1", "inline", dependencies), "https://storage.example/signed");
  assert.equal(await getKbFileUrl("org-1", "kb-1", "attachment", dependencies), "https://storage.example/signed");
  assert.deepEqual(calls, [
    [source.storagePath, 300, "quarterly_report__.pdf", "inline", "application/pdf"],
    [source.storagePath, 300, "quarterly_report__.pdf", "attachment", undefined],
  ]);
});

test("KB file links reject missing, cross-organization, URL, and unsupported previews", async () => {
  const lookup = (value: typeof source | null) => ({ getByIdForOrg: async () => value as never });
  await assert.rejects(getKbFileUrl("org-1", "kb-1", "attachment", lookup(null)), NotFoundError);
  await assert.rejects(getKbFileUrl("org-1", "kb-1", "attachment", lookup({ ...source, organizationId: "org-2" })), NotFoundError);
  await assert.rejects(getKbFileUrl("org-1", "kb-1", "attachment", lookup({ ...source, storagePath: "kb/org-2/8d55565f-1111-4111-8111-f95fd03f0df2.pdf" })), NotFoundError);
  await assert.rejects(getKbFileUrl("org-1", "kb-1", "attachment", lookup({ ...source, sourceType: "URL" })), BadRequestError);
  await assert.rejects(getKbFileUrl("org-1", "kb-1", "inline", lookup({ ...source, sourceType: "DOCX", storagePath: source.storagePath.replace(/\.pdf$/, ".docx") })), BadRequestError);
});
