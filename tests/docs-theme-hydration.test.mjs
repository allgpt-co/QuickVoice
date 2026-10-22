import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const docsRequire = createRequire(new URL("../apps/docs/package.json", import.meta.url));
const { createElement } = docsRequire("react");
const { renderToString } = docsRequire("react-dom/server");
const compiled = ts.transpileModule(
  readFileSync(new URL("../apps/docs/src/components/theme-toggle.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } },
).outputText;

function renderThemeToggle(theme) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: cjsModule.exports,
    require: docsRequire,
    ...(theme ? {
      window: { localStorage: { getItem: () => theme } },
      document: { documentElement: { dataset: { theme } } },
    } : {}),
  });
  return renderToString(createElement(cjsModule.exports.ThemeToggle));
}

test("docs theme controls have identical server/hydration HTML for saved light and dark themes", () => {
  const serverHtml = renderThemeToggle();
  assert.match(serverHtml, /Switch to light mode/);
  assert.equal(renderThemeToggle("dark"), serverHtml);
  assert.equal(renderThemeToggle("light"), serverHtml);
});
