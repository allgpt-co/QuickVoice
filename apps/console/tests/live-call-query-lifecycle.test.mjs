import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function queryHooks(client = {}) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(
    readFileSync(new URL("../src/hooks/queries/calls.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, {
    exports: cjsModule.exports,
    require: (name) => {
      if (name === "@tanstack/react-query") return {
        useQuery: (options) => options, useMutation: (options) => options,
        useQueryClient: () => client,
      };
      if (name === "sonner") return { toast: { success() {}, error() {} } };
      if (name.endsWith("resources/calls")) return { callsApi: {} };
      if (name.endsWith("query-keys")) return { queryKeys: { calls: { live: () => ["calls", "live"] } } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return cjsModule.exports;
}

test("live calls poll promptly while listed and retain the slower idle budget", () => {
  const options = queryHooks().useLiveCalls();
  assert.equal(options.refetchInterval({ state: { data: [] } }), 60_000);
  assert.equal(options.refetchInterval({ state: { data: undefined } }), 60_000);
  assert.equal(options.refetchInterval({ state: { data: [{ callId: "ringing" }] } }), 10_000);
});

test("manual hangup cancels stale polling before removing only the ended room", async () => {
  const operations = [];
  let calls = [{ roomName: "outbound_ended" }, { roomName: "outbound_other" }];
  const hooks = queryHooks({
    cancelQueries: async () => { operations.push("cancel"); },
    setQueryData: (_key, update) => { operations.push("remove"); calls = update(calls); },
    invalidateQueries: async () => { operations.push("refresh"); },
  });
  await hooks.useEndLiveCall().onSuccess(undefined, "outbound_ended");
  assert.deepEqual(calls, [{ roomName: "outbound_other" }]);
  assert.deepEqual(operations, ["cancel", "remove", "refresh"]);
});
