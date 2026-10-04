import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/tools/McpToolBadges.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const cjsModule = { exports: {} };
vm.runInNewContext(compiled, {
  exports: cjsModule.exports,
  module: cjsModule,
  require: (id) => id.endsWith("/ui/badge")
    ? { Badge: ({ children }) => React.createElement("span", null, children) }
    : require(id),
});
const render = (tools) => renderToStaticMarkup(React.createElement(cjsModule.exports.McpToolBadges, { tools }));

test("missing or ambiguous policy labels fail closed and explain the call restriction", () => {
  for (const requiresConfirmation of [undefined, null, true, "false"]) {
    const html = render([{ name: "legacy_tool", requiresConfirmation }]);
    assert.match(html, /Confirmation required/);
    assert.match(html, /blocked during agent calls/);
    assert.doesNotMatch(html, />Read-only</);
  }
});

test("explicit server approval labels read-only tools and empty lists render nothing", () => {
  const html = render([{ name: "list_files", requiresConfirmation: false }]);
  assert.match(html, /Read-only/);
  assert.doesNotMatch(html, /Confirmation required|blocked during agent calls/);
  assert.equal(render(null), "");
  assert.equal(render([]), "");
});
