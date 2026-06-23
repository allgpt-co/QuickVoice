import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

function loadApiErrorStateModule() {
  const source = readFileSync(join(root, "src/lib/api-error-state.ts"), "utf8");
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
    require,
  });

  return cjsModule.exports;
}

test("api error state copy distinguishes auth, permission, offline, server, and unknown failures", () => {
  const { getApiErrorStateCopy } = loadApiErrorStateModule();

  const unauthorized = getApiErrorStateCopy(
    { status: 401, code: "UNAUTHORIZED" },
    { resourceName: "call logs" }
  );
  assert.equal(unauthorized.kind, "permission");
  assert.equal(unauthorized.reason, "unauthorized");
  assert.equal(unauthorized.title, "Sign in to load call logs");
  assert.match(unauthorized.description, /session/i);

  const forbidden = getApiErrorStateCopy(
    { status: 403, code: "FORBIDDEN" },
    { resourceName: "dashboard" }
  );
  assert.equal(forbidden.kind, "permission");
  assert.equal(forbidden.reason, "forbidden");
  assert.equal(forbidden.title, "Dashboard access required");
  assert.match(forbidden.description, /role/i);

  const offlineByStatus = getApiErrorStateCopy(
    { status: 0 },
    { resourceName: "phone numbers", isOnline: true }
  );
  assert.equal(offlineByStatus.kind, "offline");
  assert.equal(offlineByStatus.reason, "offline");
  assert.equal(offlineByStatus.title, "Phone numbers unavailable offline");

  const offlineByCode = getApiErrorStateCopy(
    { code: "ERR_NETWORK" },
    { resourceName: "knowledge base", isOnline: true }
  );
  assert.equal(offlineByCode.kind, "offline");
  assert.match(offlineByCode.description, /Reconnect/i);

  const offlineByFetchMessage = getApiErrorStateCopy(
    new TypeError("Failed to fetch"),
    { resourceName: "agents", isOnline: true }
  );
  assert.equal(offlineByFetchMessage.kind, "offline");
  assert.equal(offlineByFetchMessage.reason, "offline");
  assert.equal(offlineByFetchMessage.title, "Agents unavailable offline");

  const server = getApiErrorStateCopy(
    { status: 503, code: "SERVICE_UNAVAILABLE" },
    { resourceName: "agents" }
  );
  assert.equal(server.kind, "error");
  assert.equal(server.reason, "server");
  assert.equal(server.title, "QuickVoice service unavailable");
  assert.match(server.description, /server error/i);
  assert.doesNotMatch(server.description, /checking your connection/i);

  const unknown = getApiErrorStateCopy(
    new Error("boom"),
    { resourceName: "call detail" }
  );
  assert.equal(unknown.kind, "error");
  assert.equal(unknown.reason, "unknown");
  assert.equal(unknown.title, "Could not load call detail");
  assert.doesNotMatch(unknown.description, /checking your connection/i);
});
