import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { APIError } from "better-auth";

process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder";
process.env.BETTER_AUTH_URL ||= "http://localhost:5000";
process.env.BETTER_AUTH_SECRET ||= "test-secret-with-adequate-length-32chars";
process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

const { auth } = await import("../../src/lib/auth.js");
const permissions = await import("../../src/middleware/authorize.middleware.js");
const require = createRequire(new URL("../../src/realtime/live-transcript.gateway.ts", import.meta.url));

// Stub only transport/storage; run the actual gateway and permission helper.
class SocketServer extends EventEmitter {
  sockets = { sockets: new Map() };
  middleware: any;
  use(handler: any) { this.middleware = handler; }
}
const compiled = ts.transpileModule(
  readFileSync(new URL("../../src/realtime/live-transcript.gateway.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const exports: any = {};
vm.runInNewContext(compiled, {
  exports, console,
  require: (name: string) => {
    if (name === "socket.io") return { Server: SocketServer };
    if (name === "../lib/auth.js") return { auth };
    if (name === "../middleware/authorize.middleware.js") return permissions;
    if (["../config/redis.js", "../config/origins.js", "./live-transcript.runtime.js"].includes(name)) return {};
    return require(name);
  },
});

for (const status of ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"] as const) {
  test(`removed member gets no further transcript and cannot reconnect (${status})`, async (t) => {
    let removed = false;
    t.mock.method(auth.api, "getSession", async () => ({
      user: { id: "user_123" }, session: { activeOrganizationId: "org_123" },
    }));
    t.mock.method(auth.api, "hasPermission", async () => {
      if (removed) throw new APIError(status, { message: "Membership removed" });
      return { success: true };
    });
    const subscriber = Object.assign(new EventEmitter(), { subscribe: async () => {} });
    const gateway = new exports.LiveTranscriptGateway({}, {}, subscriber);
    const delivered: unknown[] = [];
    let disconnected = false;
    const socket = {
      id: "socket_123", request: { headers: {} }, data: {},
      rooms: new Set([exports.callRoom("org_123", "call_123")]),
      emit: (...args: unknown[]) => { delivered.push(args); },
      disconnect: () => { disconnected = true; socket.rooms.clear(); },
    };
    let connectionError: any;
    await gateway.io.middleware(socket, (error: unknown) => { connectionError = error; });
    assert.equal(connectionError, undefined);
    gateway.io.sockets.sockets.set(socket.id, socket);
    await gateway.start();
    const publish = async () => {
      subscriber.emit("message", "quickvoice:live:events", JSON.stringify({
        version: 1, type: "transcript.final", organizationId: "org_123",
        callId: "call_123", roomName: "room_123", eventId: "1720000001000-0", messageId: "message_123",
        speaker: "agent", text: "Private transcript", timestamp: "2026-10-03T12:00:00.000Z",
        occurredAt: "2026-10-03T12:00:00.000Z",
      }));
      await gateway.deliveryChain;
    };
    await publish();
    assert.equal(delivered.length, 1, "authorized member receives transcripts");
    removed = true;
    await publish();
    assert.equal(disconnected, true);
    assert.equal(delivered.length, 1, "no transcript is delivered after membership denial");
    await publish();
    assert.equal(delivered.length, 1);
    await gateway.io.middleware(socket, (error: unknown) => { connectionError = error; });
    assert.equal(connectionError?.data?.code, "FORBIDDEN", "denial must not become auth unavailable");
    subscriber.removeAllListeners();
  });
}

test("transcript delivery revalidates 60 sockets in batches of at most 20", async (t) => {
  let active = 0;
  let peak = 0;
  t.mock.method(auth.api, "getSession", async () => ({
    user: { id: "user_123" }, session: { activeOrganizationId: "org_123" },
  }));
  t.mock.method(auth.api, "hasPermission", async () => {
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
    return { success: true };
  });
  const gateway = new exports.LiveTranscriptGateway({}, {}, new EventEmitter());
  let delivered = 0;
  for (let index = 0; index < 60; index++) {
    gateway.io.sockets.sockets.set(String(index), {
      request: { headers: {} }, data: { userId: "user_123", organizationId: "org_123" },
      rooms: new Set([exports.callRoom("org_123", "call_123")]),
      emit: () => { delivered++; }, disconnect: () => assert.fail("authorized socket disconnected"),
    });
  }
  await gateway.deliverAuthorizedEvent({ type: "transcript.final", organizationId: "org_123", callId: "call_123" });
  assert.equal(delivered, 60);
  assert.ok(peak <= 20, `peak auth concurrency was ${peak}`);
});
