import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import prisma from "../../src/config/prisma.js";
import { reserveWidgetSession } from "../../src/modules/widgets/widget.repository.js";

const input = { sessionId: "s", widgetId: "w", organizationId: "o", agentId: "a", roomName: "r", callId: "r", participantIdentity: "p", origin: null, endTokenHash: "hash", expiresAt: new Date(Date.now() + 900_000), metadata: {} };
test("widget reservation serializes count and insert across simultaneous requests", async (t) => {
  let count = 0;
  let lock = Promise.resolve();
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: any) => {
    let release: (() => void) | undefined;
    let locked = false;
    const tx = {
      $queryRaw: async (query: TemplateStringsArray) => {
        assert.match(query.join("?"), /FOR UPDATE/);
        const before = lock; lock = new Promise<void>((resolve) => { release = resolve; });
        await before; locked = true; return [{ widgetId: "w" }];
      },
      agentWidgetSession: {
        count: async () => { assert.ok(locked); return count; },
        create: async ({ data }: any) => { assert.equal(data.status, "CREATED"); count++; return data; },
      },
    };
    try { return await callback(tx); } finally { release?.(); }
  }) as any;
  t.after(() => { prisma.$transaction = original; });
  const attempts = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => reserveWidgetSession({ ...input, sessionId: `s${i}` }, 5)));
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 5);
  const rejected = attempts.find((r) => r.status === "rejected");
  assert.equal(rejected?.status === "rejected" && rejected.reason.statusCode, 429);
  assert.equal(count, 5);
});

function widgetService(failAt: "reserve" | "activate" | "dispatch" | null) {
  const calls: string[] = [];
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../../src/modules/widgets/widget.service.ts", import.meta.url), "utf8");
  const exports: any = {};
  class ApiError extends Error {}
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process: { env: {} }, Buffer, URL, console, Date,
    require: (name: string) => {
      if (name === "node:crypto") return require(name);
      if (name === "http-status-codes") return { StatusCodes: { TOO_MANY_REQUESTS: 429 } };
      if (name.endsWith("widget.schema.js")) return { widgetThemeSchema: { parse: () => ({}) } };
      if (name.endsWith("redis.js")) return { redisConnection: { eval: async () => 1 } };
      if (name.endsWith("livekit.js")) return { livekitRoomServiceClient: { deleteRoom: async () => { calls.push("delete-room"); } } };
      if (name.endsWith("widget.repository.js")) return {
        findPublicWidget: async () => ({ widgetId: "w", organizationId: "o", agentId: "a", enabled: true, allowedOrigins: ["https://example.com"], agent: { isActive: true, isConfigured: true, configuration: {} } }),
        reserveWidgetSession: async () => { calls.push("reserve"); if (failAt === "reserve") throw new Error("reservation failed"); },
        activateWidgetSession: async () => { calls.push("activate"); if (failAt === "activate") throw new Error("activation failed"); },
        markWidgetSessionFailed: async () => { calls.push("failed"); },
      };
      if (name.endsWith("agent.service.js")) return {
        providerModel: () => ({}), requestVoiceSession: async (payload: any) => {
          calls.push("dispatch"); if (failAt === "dispatch") throw new Error("dispatch failed");
          return { roomName: payload.room.name, agent: { dispatchId: "d" }, expiresAt: new Date(Date.now() + 900_000).toISOString() };
        },
      };
      if (name.endsWith("call-metering.service.js")) return {
        authorizeCallBilling: async () => { calls.push("authorize"); return { action: "continue" }; },
        cancelCallBillingAdmission: async () => { calls.push("cancel-billing"); },
      };
      return { default: ApiError, BadRequestError: ApiError, NotFoundError: ApiError, PaymentRequiredError: ApiError };
    },
  });
  return { calls, run: () => exports.createPublicWidgetSession("w", "https://example.com", {}, "1.2.3.4") };
}
for (const failAt of ["reserve", "activate", "dispatch", null] as const) {
  test(`widget lifecycle compensates ${failAt ?? "no failure"} without untracked dispatch`, async () => {
    const fixture = widgetService(failAt);
    if (failAt) await assert.rejects(fixture.run()); else await fixture.run();
    if (failAt === "reserve") assert.deepEqual(fixture.calls, ["reserve"]);
    else {
      assert.deepEqual(fixture.calls.slice(0, 3), ["reserve", "authorize", "dispatch"]);
      if (failAt) for (const step of ["delete-room", "cancel-billing", "failed"]) assert.ok(fixture.calls.includes(step));
      else assert.deepEqual(fixture.calls, ["reserve", "authorize", "dispatch", "activate"]);
    }
  });
}
