import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const settle = () => new Promise((resolve) => setImmediate(resolve));

function mount(sourceType, getFile) {
  const states = [], requests = [], revoked = [], created = [], effects = [];
  const dependencies = {
    react: { useState: (initial) => [initial, (value) => states.push(value)], useEffect: (fn) => effects.push(fn) },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "lucide-react": {},
    "@/src/components/ui/button": { Button: "button" },
    "@/src/components/ui/dialog": {},
    "@/src/lib/export-csv": { downloadBlobAsFile() {} },
    "@/src/lib/api/resources/kb": { kbApi: { file: (...args) => { requests.push(args); return getFile(...args); } } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/components/kb/KbDocumentPreview.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: cjsModule, exports: cjsModule.exports, AbortController, Blob,
    URL: { createObjectURL: (blob) => { created.push(blob); return "blob:document"; }, revokeObjectURL: (url) => revoked.push(url) },
    require: (name) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  cjsModule.exports.KbDocumentPreview({ source: { kbId: "kb-a", sourceType }, fileName: "Instructions.txt", onBack() {} });
  const cleanups = effects.map((fn) => fn());
  return { states, requests, revoked, created, close: () => cleanups.forEach((fn) => fn?.()) };
}

test("text previews preserve Unicode and literal markup without creating an executable document", async () => {
  const text = "नमस्ते <script>alert('test')</script>";
  const view = mount("TXT", async () => new Blob([text], { type: "text/html" }));
  await settle();
  assert.equal(view.requests[0][0], "kb-a");
  assert.equal(view.requests[0][1], "inline");
  assert.equal(view.states[0].text, text);
  assert.equal(view.created.length, 0);
  view.close();
  assert.equal(view.requests[0][2].aborted, true);
});

test("large text preview is bounded while the complete original stays available for download", async () => {
  const blob = new Blob(["x".repeat(300_000)]);
  const view = mount("CSV", async () => blob);
  await settle();
  assert.equal(view.states[0].text.length, 200_000);
  assert.equal(view.states[0].truncated, true);
  assert.equal(view.states[0].blob, blob);
  view.close();
});

test("PDF previews force PDF MIME and release object URLs on close", async () => {
  const view = mount("PDF", async () => new Blob(["%PDF-test"], { type: "text/html" }));
  await settle();
  assert.equal(view.created[0].type, "application/pdf");
  assert.equal(view.states[0].url, "blob:document");
  view.close();
  assert.deepEqual(view.revoked, ["blob:document"]);
});

test("closing or changing source cancels the fetch and ignores late document results", async () => {
  let resolve;
  const view = mount("PDF", () => new Promise((done) => { resolve = done; }));
  view.close();
  assert.equal(view.requests[0][2].aborted, true);
  resolve(new Blob(["late"]));
  await settle();
  assert.equal(view.created.length, 0);
  assert.equal(view.states.length, 0);
});

test("failed preview shows a recoverable error", async () => {
  const view = mount("TXT", async () => { throw new Error("storage unavailable"); });
  await settle();
  assert.match(view.states[0], /Could not load.*try again/);
  view.close();
});
