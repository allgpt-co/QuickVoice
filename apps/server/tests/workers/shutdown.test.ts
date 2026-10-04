import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { closeRedisClient, closeResourcesInPhases } from "../../src/workers/shutdown.js";

test("shutdown closes every resource and waits for workers before dependencies", async () => {
  const events: string[] = [];
  let finishWorker!: () => void;
  const workerFinished = new Promise<void>((resolve) => {
    finishWorker = resolve;
  });

  const closing = closeResourcesInPhases([
    [
      async () => {
        events.push("worker-start");
        await workerFinished;
        events.push("worker-end");
      },
      async () => {
        events.push("other-worker");
        throw new Error("worker close failed");
      },
    ],
    [
      () => {
        events.push("redis");
      },
      () => {
        events.push("database");
      },
    ],
  ]);

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["worker-start", "other-worker"]);
  finishWorker();
  await assert.rejects(closing, /resources failed to close/);
  assert.deepEqual(events, [
    "worker-start",
    "other-worker",
    "worker-end",
    "redis",
    "database",
  ]);
});


test("Redis cleanup never queues QUIT on an offline connection", async () => {
  for (const status of ["wait", "connecting", "reconnecting", "close", "end"] as const) {
    let disconnects = 0;
    let quits = 0;
    await closeRedisClient({ status,
      quit: async () => { quits++; return "OK"; },
      disconnect: () => { disconnects++; },
    });
    assert.equal(quits, 0);
    assert.equal(disconnects, status === "end" ? 0 : 1);
  }
});

test("Redis cleanup disconnects after successful, rejected, or stalled QUIT", { timeout: 2000 }, async () => {
  for (const result of ["success", "failure", "stall"]) {
    let disconnects = 0;
    let quits = 0;
    await closeRedisClient({ status: "ready",
      quit: async () => {
        quits++;
        if (result === "failure") throw new Error("Connection closed");
        if (result === "stall") return new Promise<"OK">(() => {});
        return "OK";
      },
      disconnect: () => { disconnects++; },
    }, 20);
    assert.equal(quits, 1);
    assert.equal(disconnects, 1);
  }
});

test("real ioredis outage with queued UNSUBSCRIBE does not prevent natural process exit", { timeout: 7000 }, async () => {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const moduleUrl = new URL("../../src/workers/shutdown.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import { Redis } from "ioredis";
    import { closeRedisClient } from ${JSON.stringify(moduleUrl)};
    const client = new Redis({ host: "127.0.0.1", port: ${address.port},
      maxRetriesPerRequest: null, lazyConnect: true, retryStrategy: () => 10,
    });
    client.on("error", () => {});
    const reconnecting = new Promise(resolve => client.once("reconnecting", resolve));
    void client.unsubscribe("test-channel").catch(() => {});
    await reconnecting;
    await closeRedisClient(client, 20);
    console.log("cleanup complete");
  `], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /cleanup complete/);
});

test("SIGTERM deadline exits a stuck shutdown, but does not delay a clean exit", () => {
  const moduleUrl = new URL("../../src/workers/shutdown.ts", import.meta.url).href;
  const run = (source: string) => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
    `import { armShutdownDeadline, closeResourcesInPhases } from ${JSON.stringify(moduleUrl)};\n${source}`,
  ], { encoding: "utf8", timeout: 5000 });
  const clean = run("armShutdownDeadline(30_000);");
  assert.equal(clean.status, 0, clean.stderr);
  const stuck = run(`
    process.once("SIGTERM", () => {
      armShutdownDeadline(30);
      void closeResourcesInPhases([[() => new Promise(() => {})]]);
    });
    setInterval(() => {}, 1000);
    process.kill(process.pid, "SIGTERM");
  `);
  assert.equal(stuck.status, 1, stuck.stderr);
  assert.match(stuck.stderr, /shutdown deadline exceeded/);
  const main = readFileSync(new URL("../../src/index.ts", import.meta.url), "utf8");
  assert.match(main, /shuttingDown = true;\s+armShutdownDeadline\(\);/);
  const gateway = readFileSync(new URL("../../src/realtime/live-transcript.gateway.ts", import.meta.url), "utf8");
  assert.match(gateway, /await closeRedisClient\(this.subscriber\)/);
  assert.doesNotMatch(gateway, /\.unsubscribe\(/);
});

test("HTTP drain gives post-response audit writes one second before database shutdown", { timeout: 3000 }, async () => {
  const vm = await import("node:vm");
  const ts = await import("typescript");
  const { setTimeout: settle } = await import("node:timers/promises");
  const source = readFileSync(new URL("../../src/index.ts", import.meta.url), "utf8");
  const shutdown = source.slice(source.indexOf("let shuttingDown = false;"), source.indexOf('process.once("SIGINT"'));
  const events: string[] = [];
  const exports: any = {};
  const noop = async () => {};
  const context: any = {
    exports, console: { log() {}, error() {} }, process: {}, settle, closeResourcesInPhases,
    armShutdownDeadline: noop, stopSilentCallWatchdog: noop, stopAgentDeletionRecovery: noop,
    liveTranscriptGateway: { close: noop },
    httpServer: { listening: true, close(callback: () => void) {
      events.push("http-drained");
      setTimeout(() => events.push("audit-written"), 100);
      callback();
    } },
    prisma: { $disconnect: async () => { events.push("database-closed"); } },
  };
  for (const name of ["closeKbWorker", "closeOutboundBatchWorker", "closeAgentDeletionWorker",
    "closeKbQueue", "closeOutboundBatchQueue", "closeAgentDeletionQueue", "closeRateLimitStore", "closeRedisConnection"]) context[name] = noop;
  vm.runInNewContext(ts.transpileModule(`${shutdown}\nexports.shutdown = shutdown;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const start = Date.now();
  await exports.shutdown("SIGTERM");
  assert.ok(Date.now() - start >= 950, "one-second grace period must not be skipped");
  assert.deepEqual(events, ["http-drained", "audit-written", "database-closed"]);
  assert.equal(context.process.exitCode, 0);
});
