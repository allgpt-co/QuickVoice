import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadUrlValidation() {
  const compiled = ts.transpileModule(
    read("src/components/tools/custom-mcp-url.ts"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const cjsModule = { exports: {} };

  vm.runInNewContext(compiled, {
    exports: cjsModule.exports,
    module: cjsModule,
    require,
    URL,
  });

  return cjsModule.exports;
}

test("custom MCP URL validation accepts public HTTPS MCP and legacy SSE endpoints", () => {
  const { validateCustomMcpUrl } = loadUrlValidation();

  assert.equal(
    validateCustomMcpUrl("https://server.example.com/mcp").isValid,
    true
  );
  assert.equal(
    validateCustomMcpUrl("https://demo-day.mcp.cloudflare.com/sse").isValid,
    true
  );
});

test("custom MCP URL validation rejects insecure, malformed, and credential URLs", () => {
  const { validateCustomMcpUrl } = loadUrlValidation();

  assert.match(validateCustomMcpUrl("demo.example.com/mcp").message, /full URL/i);
  assert.match(validateCustomMcpUrl("http://demo.example.com/mcp").message, /HTTPS/);
  assert.match(
    validateCustomMcpUrl("https://token@demo.example.com/mcp").message,
    /Remove credentials/
  );
});

test("custom MCP form explains endpoint requirements, naming, and follow-up setup", () => {
  const source = read("src/components/tools/McpMarketplace.tsx");

  assert.match(source, /Before you connect/);
  assert.match(source, /full public HTTPS endpoint/i);
  assert.match(
    source,
    /Legacy <code>\/sse<\/code>\{" "\}\s+endpoints are accepted/
  );
  assert.match(source, /Display name/);
  assert.match(source, /only inside QuickVoice/i);
  assert.match(source, /complete it after connecting/i);
  assert.match(source, /Continue setup/);
  assert.match(source, /type="url"/);
  assert.match(source, /aria-describedby="custom-mcp-url-help custom-mcp-url-status"/);
});
