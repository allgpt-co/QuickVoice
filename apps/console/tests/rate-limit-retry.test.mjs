import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const axios = require("axios");

function loadClient() {
  let now = Date.parse("2026-09-30T12:00:00Z");
  class Clock extends Date { static now() { return now; } }
  function load(path, overrides = {}) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const testModule = { exports: {} };
    vm.runInNewContext(output, {
      exports: testModule.exports, module: testModule, Date: Clock,
      window: { location: { pathname: "/agents" } },
      require: (name) => overrides[name] ?? require(name),
    });
    return testModule.exports;
  }
  const errors = load("../src/lib/errors.ts");
  const { apiClient } = load("../src/lib/api/client.ts", {
    "@/src/lib/errors": errors,
    "@/src/lib/links": { apiPath: () => "https://example.invalid/api/v1" },
  });
  return { apiClient, errors, advance: (ms) => { now += ms; }, now: () => now };
}

function limited(config, retryAfter) {
  return new axios.AxiosError("Too many requests", "ERR_BAD_REQUEST", config, null, {
    status: 429, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
    data: { message: "Wait", code: "RATE_LIMITED" }, config,
  });
}

test("429 blocks polling and mutations across endpoints until Retry-After without extending the deadline", async () => {
  const { apiClient, errors, advance, now } = loadClient();
  let requests = 0;
  apiClient.defaults.adapter = async (config) => {
    requests++;
    if (requests === 1) throw limited(config, "10");
    return { status: 200, data: {}, headers: {}, config };
  };
  await assert.rejects(apiClient.get("/agents"), (error) => {
    assert.equal(error.retryAt, now() + 10_000);
    assert.equal(errors.apiQueryRetryDelay(0, error), 10_000);
    assert.equal(errors.retryApiQuery(0, error), true);
    assert.equal(errors.retryApiQuery(1, error), false);
    return error.status === 429;
  });
  advance(5_000);
  for (const request of [() => apiClient.get("/calls/live"), () => apiClient.post("/agents", {})]) {
    await assert.rejects(request(), (error) => error.status === 429 && error.retryAt === now() + 5_000);
  }
  assert.equal(requests, 1, "cooldown must not send HTTP requests or replay mutations");
  advance(5_001);
  assert.equal((await apiClient.get("/kb")).status, 200);
  assert.equal(requests, 2);
});

test("Retry-After supports HTTP dates and missing or invalid headers", () => {
  const { errors, now } = loadClient();
  const future = new Date(now() + 25_000).toUTCString();
  assert.equal(errors.toApiError(limited({}, future)).retryAt, now() + 25_000);
  for (const header of [undefined, "", "bad", "-10", "0", new Date(now() - 1000).toUTCString()]) {
    assert.equal(errors.toApiError(limited({}, header)).retryAt, now() + 60_000);
  }
  for (const status of [400, 401, 403, 404]) {
    assert.equal(errors.retryApiQuery(0, new errors.ApiError("bad", status)), false);
  }
  assert.equal(errors.retryApiQuery(0, new errors.ApiError("offline", 0)), true);
  assert.equal(errors.retryApiQuery(0, new errors.ApiError("server", 503)), true);
});
