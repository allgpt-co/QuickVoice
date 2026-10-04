import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isBuiltin, createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

test("workspace installs do not expose hoisted transitive dependencies", () => {
  const config = read(".npmrc");
  assert.match(config, /^node-linker=isolated$/m);
  assert.match(config, /^public-hoist-pattern\[\]=\s*$/m);
  const widgetRequire = createRequire(new URL("apps/widget/package.json", root));
  assert.ok(widgetRequire.resolve("livekit-client"));
  assert.throws(() => widgetRequire.resolve("express"), { code: "MODULE_NOT_FOUND" });
});

test("workspace source imports declare their dependencies in their own manifest", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0").filter((file) => file && existsSync(new URL(file, root)));
  const manifests = files.filter((file) => file === "package.json" || /^(apps|packages)\/[^/]+\/package.json$/.test(file))
    .map((file) => ({ dir: path.dirname(file), file, data: JSON.parse(read(file)) }))
    .sort((a, b) => b.dir.length - a.dir.length);
  const missing = new Set();
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/.test(file) || /(^|\/)(generated|public|dist|node_modules)\//.test(file) || file.startsWith("apps/ai/")) continue;
    const owner = manifests.find(({ dir }) => dir === "." || file.startsWith(`${dir}/`));
    const declared = { ...owner.data.dependencies, ...owner.data.devDependencies, ...owner.data.peerDependencies, ...owner.data.optionalDependencies };
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    function visit(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      else if (ts.isModuleDeclaration(node)) specifier = node.name;
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require")) specifier = node.arguments[0];
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const value = specifier.text;
        if (value && !/^(\.|\/|@\/|~\/|#)/.test(value) && !value.includes(":") && !isBuiltin(value)) {
          const dependency = value.split("/").slice(0, value.startsWith("@") ? 2 : 1).join("/");
          if (!declared[dependency] && !(ts.isModuleDeclaration(node) && declared[`@types/${dependency}`]) && dependency !== owner.data.name) missing.add(`${file}: declare ${dependency} in ${owner.file}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual([...missing], []);
});
