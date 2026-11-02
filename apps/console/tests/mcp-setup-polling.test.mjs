import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/hooks/queries/mcp.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function fixture(refresh) {
  const messages = [];
  const intervals = new Set();
  const listeners = new Map();
  const effects = [];
  let invalidations = 0;
  let settled = 0;
  const qc = {
    invalidateQueries: () => {
      invalidations++;
    },
  };
  const window = {
    location: {
      href: "https://console.test/tools?mcpConnectionId=b07f665d-ca0e-4e4e-924a-5d70a6a1ff02&other=keep#details",
    },
    history: {
      state: {},
      replaceState: (_state, _title, href) => {
        window.location.href = href;
      },
    },
    setInterval: (fn) => {
      intervals.add(fn);
      return fn;
    },
    clearInterval: (fn) => intervals.delete(fn),
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: (event) => listeners.delete(event),
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    window,
    URL,
    Error,
    require: (id) => {
      if (id === "react")
        return { useEffect: (effect) => effects.push(effect) };
      if (id === "@tanstack/react-query") return { useQueryClient: () => qc };
      if (id === "sonner")
        return {
          toast: Object.fromEntries(
            ["success", "error", "info"].map((kind) => [
              kind,
              (message) => messages.push({ kind, message }),
            ]),
          ),
        };
      if (id.endsWith("resources/mcp")) return { mcpApi: { refresh } };
      if (id.endsWith("query-keys"))
        return { queryKeys: { mcp: { all: ["mcp"] } } };
      throw new Error(`Unexpected import ${id}`);
    },
  });
  return {
    ...exports,
    qc,
    window,
    messages,
    intervals,
    listeners,
    effects,
    start: () =>
      exports.pollMcpSetup("connection", qc, () => {
        settled++;
      }),
    tick: async () => {
      for (const fn of [...intervals]) await fn();
    },
    get invalidations() {
      return invalidations;
    },
    get settled() {
      return settled;
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("polling survives slow consent and verifies Connected before success", async () => {
  let status = "AUTH_REQUIRED";
  const f = fixture(async () => ({ status, displayName: "Notion" }));
  f.start();
  await flush();
  for (let i = 0; i < 30; i++) await f.tick();
  assert.equal(f.intervals.size, 1);
  assert.equal(f.messages.length, 0);
  status = "CONNECTED";
  await f.listeners.get("focus")();
  assert.equal(f.messages[0].kind, "success");
  assert.equal(f.invalidations, 32);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.settled, 1);
});

test("tool sync errors retry and surface failure without reporting Connected", async () => {
  const f = fixture(async () => ({
    status: "ERROR",
    metadata: {
      lastSyncError: "Authorization completed, but tools could not be synced.",
    },
  }));
  f.start();
  await flush();
  await f.tick();
  await f.tick();
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].kind, "error");
  assert.match(f.messages[0].message, /tools could not be synced/);
  assert.equal(f.intervals.size, 0);
});

test("unmount cleanup ignores late responses and never leaves a timer", async () => {
  let resolve;
  const f = fixture(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const stop = f.start();
  stop();
  resolve({ status: "CONNECTED", displayName: "Notion" });
  await flush();
  assert.equal(f.messages.length, 0);
  assert.equal(f.invalidations, 0);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.listeners.size, 0);
});

test("return hook selects connections, syncs, and removes only its callback parameter", async () => {
  const f = fixture(async () => ({
    status: "CONNECTED",
    displayName: "Notion",
  }));
  let tab;
  f.useMcpSetupReturn((value) => {
    tab = value;
  });
  const cleanup = f.effects[0]();
  await flush();
  assert.equal(tab, "connections");
  assert.equal(
    f.window.location.href,
    "https://console.test/tools?other=keep#details",
  );
  assert.equal(f.messages.at(-1).kind, "success");
  cleanup();
});

test("invalid callback IDs never trigger provider synchronization", () => {
  const f = fixture(() => {
    throw new Error("must not run");
  });
  f.window.location.href = "https://console.test/tools?mcpConnectionId=invalid";
  f.useMcpSetupReturn(() => {
    throw new Error("must not select tab");
  });
  assert.equal(f.effects[0](), undefined);
  assert.equal(f.intervals.size, 0);
});
