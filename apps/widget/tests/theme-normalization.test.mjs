import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function evaluate(path, names, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const selected = names ? ast.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(
      (declaration) => names.includes(declaration.name.getText(ast)),
    )),
  ).map((node) => node.getText(ast)).join("\n") : source;
  const { outputText } = ts.transpileModule(selected, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const scope = vm.createContext({ require: createRequire(new URL(path, import.meta.url)), exports: {}, URL, ...globals });
  vm.runInContext(outputText, scope);
  return scope;
}

const widget = evaluate("../src/index.ts", [
  "DEFAULT_THEME", "normalizeTheme", "isWidgetPosition", "isLauncherSize",
  "safeImageUrl", "escapeHtml", "positionStyles",
]);
const schema = evaluate("../../server/src/modules/widgets/widget.schema.ts");
const server = evaluate("../../server/src/modules/widgets/widget.service.ts", [
  "DEFAULT_THEME", "mergeTheme",
], { widgetThemeSchema: schema.exports.widgetThemeSchema });

for (const [label, normalize] of [["widget", widget.normalizeTheme], ["server", server.mergeTheme]]) {
  const defaults = { ...normalize() };
  test(`${label}: null and malformed theme fields fall back individually`, () => {
    for (const value of [null, undefined, [], "invalid", 42]) {
      assert.deepEqual({ ...normalize(value) }, defaults);
    }
    for (const key of Object.keys(defaults)) {
      for (const value of [null, undefined, {}, []]) {
        assert.deepEqual({ ...normalize({ [key]: value }) }, defaults, `${key}: ${value}`);
      }
    }
    assert.deepEqual({ ...normalize(Object.fromEntries(Object.keys(defaults).map((key) => [key, null]))) }, defaults);
    assert.equal(normalize({ position: "invalid" }).position, defaults.position);
    assert.equal(normalize({ panelWidth: NaN }).panelWidth, defaults.panelWidth);
    assert.equal(normalize({ panelWidth: Infinity }).panelWidth, defaults.panelWidth);
    assert.equal(normalize({ avatarImageUrl: "javascript:alert(1)" }).avatarImageUrl, null);
  });

  test(`${label}: valid customization survives alongside invalid fields`, () => {
    const theme = normalize({
      brandName: "Acme", welcomeText: null, position: "top-left", launcherSize: "compact",
      primaryColor: "#112233", panelWidth: 380, borderRadius: 0,
      showAvatar: false, whiteLabel: true, defaultOpen: false,
      avatarImageUrl: "https://example.com/avatar.png",
    });
    assert.equal(theme.welcomeText, defaults.welcomeText);
    for (const [key, value] of Object.entries({
      brandName: "Acme", position: "top-left", launcherSize: "compact",
      primaryColor: "#112233", panelWidth: 380, borderRadius: 0,
      showAvatar: false, whiteLabel: true, defaultOpen: false,
      avatarImageUrl: "https://example.com/avatar.png",
    })) assert.equal(theme[key], value, key);
    assert.equal(normalize({ avatarImageUrl: null }).avatarImageUrl, null);
  });
}

test("normalized widget fields render safely and still escape HTML", () => {
  const theme = widget.normalizeTheme({ brandName: null, actionText: {}, position: null });
  assert.equal(widget.escapeHtml(theme.brandName), "QuickVoice");
  assert.equal(widget.escapeHtml(theme.actionText), "Talk to us");
  assert.equal(widget.positionStyles(theme.position).vertical, "bottom");
  assert.equal(widget.escapeHtml(widget.normalizeTheme({ brandName: '<b>&"\'' }).brandName),
    "&lt;b&gt;&amp;&quot;&#39;");
});
