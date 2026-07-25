import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadKbErrorCopyModule() {
  const source = readFileSync(
    join(root, "src/components/kb/kb-error-copy.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };

  vm.runInNewContext(compiled, {
    exports: cjsModule.exports,
    module: cjsModule,
  });

  return cjsModule.exports;
}

test("empty text errors explain the cause and tell users to use OCR", () => {
  const { getKbErrorCopy } = loadKbErrorCopyModule();
  const copy = getKbErrorCopy({
    errorCode: "KB_EMPTY_TEXT",
    errorMessage: "No readable text was found in this knowledge source.",
    errorRetryable: false,
    sourceType: "PDF",
  });

  assert.equal(
    copy.reason,
    "No readable text was found in this knowledge source.",
  );
  assert.match(copy.guidance, /selectable text/i);
  assert.match(copy.guidance, /OCR/i);
});

test("configuration errors direct users to a workspace administrator", () => {
  const { getKbErrorCopy } = loadKbErrorCopyModule();
  const copy = getKbErrorCopy({
    errorCode: "KB_VECTOR_STORE_HOST_MISSING",
    errorMessage: "Knowledge processing is not configured.",
    errorRetryable: false,
    sourceType: "DOCX",
  });

  assert.match(copy.guidance, /workspace administrator/i);
  assert.doesNotMatch(copy.guidance, /PINECONE_HOST/);
});

test("legacy failed rows clearly say diagnostics were not recorded", () => {
  const { getKbErrorCopy } = loadKbErrorCopyModule();
  const copy = getKbErrorCopy({
    errorCode: null,
    errorMessage: null,
    errorRetryable: null,
    sourceType: "TXT",
  });

  assert.match(copy.reason, /diagnostics were recorded/i);
  assert.match(copy.guidance, /correct the issue/i);
});
