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

function fixture(refresh, BroadcastChannel) {
  const messages = [];
  const intervals = new Set();
  const listeners = new Map();
  const effects = [];
  const timeouts = new Set();
  let closeCount = 0;
  let focusCount = 0;
  let invalidations = 0;
  let settled = 0;
  const qc = {
    invalidateQueries: () => {
      invalidations++;
    },
  };
  const window = {
    open: () => null,
    close: () => {
      closeCount++;
    },
    focus: () => {
      focusCount++;
    },
    setTimeout: (fn) => {
      timeouts.add(fn);
      return fn;
    },
    clearTimeout: (fn) => timeouts.delete(fn),
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
    BroadcastChannel,
    require: (id) => {
      if (id === "react")
        return {
          useEffect: (effect) => effects.push(effect),
          useRef: (value) => ({ current: value }),
        };
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
    get closeCount() {
      return closeCount;
    },
    get focusCount() {
      return focusCount;
    },
    expireAcknowledgement: () => {
      for (const fn of timeouts) fn();
    },
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

function channelBus() {
  const channels = new Set();
  return class {
    constructor(name) {
      this.name = name;
      channels.add(this);
    }
    postMessage(data) {
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name)
          queueMicrotask(() => {
            if (channels.has(channel)) channel.onmessage?.({ data });
          });
      }
    }
    close() {
      channels.delete(this);
    }
  };
}
const connectionId = "b07f665d-ca0e-4e4e-924a-5d70a6a1ff02";

test("successful return refreshes the original tab and closes only after its acknowledgement", async () => {
  const Channel = channelBus();
  const original = fixture(async () => ({ status: "AUTH_REQUIRED" }), Channel);
  let opened;
  original.window.open = (...args) => {
    opened = args;
  };
  original.useOpenMcpSetup()(
    "https://connect.composio.dev/setup",
    connectionId,
  );
  const returned = fixture(
    async () => ({ status: "CONNECTED", displayName: "Notion" }),
    Channel,
  );
  returned.useMcpSetupReturn(() => {});
  const cleanup = returned.effects[0]();
  await flush();
  assert.equal(opened[2], "noopener,noreferrer");
  assert.equal(original.focusCount, 1);
  assert.equal(original.invalidations, 2);
  assert.equal(returned.closeCount, 1);
  assert.equal(original.intervals.size, 0);
  cleanup();
});

test("return stays open when the initiator closed or a different connection is being authorized", async () => {
  const Channel = channelBus();
  const other = fixture(async () => ({ status: "AUTH_REQUIRED" }), Channel);
  other.useOpenMcpSetup()("https://connect.composio.dev/setup", "other-id");
  const returned = fixture(
    async () => ({ status: "CONNECTED", displayName: "Notion" }),
    Channel,
  );
  returned.useMcpSetupReturn(() => {});
  const cleanup = returned.effects[0]();
  await flush();
  returned.expireAcknowledgement();
  assert.equal(returned.closeCount, 0);
  assert.equal(other.focusCount, 0);
  cleanup();
  other.effects[0]()();
});

test("failed tool sync stays visible instead of closing the return tab", async () => {
  const Channel = channelBus();
  const original = fixture(async () => ({ status: "AUTH_REQUIRED" }), Channel);
  original.useOpenMcpSetup()(
    "https://connect.composio.dev/setup",
    connectionId,
  );
  const returned = fixture(async () => ({ status: "ERROR" }), Channel);
  returned.useMcpSetupReturn(() => {});
  const cleanup = returned.effects[0]();
  await flush();
  await returned.tick();
  await returned.tick();
  await flush();
  assert.equal(returned.closeCount, 0);
  assert.equal(original.focusCount, 0);
  cleanup();
  original.effects[0]()();
});
