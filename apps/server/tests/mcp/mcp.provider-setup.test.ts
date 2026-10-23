import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import prisma from "../../src/config/prisma.js";
import { executeTool, refreshConnection } from "../../src/modules/mcp/mcp.service.js";

const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=private-state";

function fixture(t: TestContext) {
  const previousKey = process.env.SMITHERY_API_KEY;
  process.env.SMITHERY_API_KEY = "setup-test-only";
  const connection: any = {
    mcpConnectionId: "connection", organizationId: "org", status: "CONNECTED", metadata: {},
    smitheryNamespace: "workspace", smitheryConnectionId: "saved-google-account",
    mcpUrl: "https://api.arcade.dev/mcp/calendar", setupUrl: null,
    updatedAt: new Date(), lastSyncedAt: null,
    tools: [
      { name: "GoogleCalendar_WhoAmI", readOnly: true },
      { name: "GoogleCalendar_ListCalendars", readOnly: true },
      { name: "delete_event", annotations: { destructiveHint: true } },
    ],
  };
  const logs: any[] = [];
  const calls: { url: string; method: string }[] = [];
  let response: () => Response = () => Response.json({ calendars: [] });
  const original = [prisma.mcpConnection.findFirst, prisma.mcpConnection.updateMany, prisma.mcpToolExecutionLog.create];
  prisma.mcpConnection.findFirst = (async ({ where }: any) => {
    assert.equal(where.organizationId, "org");
    return { ...connection, metadata: structuredClone(connection.metadata) };
  }) as any;
  prisma.mcpConnection.updateMany = (async ({ where, data }: any) => {
    if (where.updatedAt && where.updatedAt.getTime() !== connection.updatedAt.getTime()) return { count: 0 };
    Object.assign(connection, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
    return { count: 1 };
  }) as any;
  prisma.mcpToolExecutionLog.create = (async ({ data }: any) => { logs.push(data); return data; }) as any;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? "GET" });
    if (!options?.method) return Response.json({ tools: connection.tools });
    return response();
  });
  t.after(() => {
    [prisma.mcpConnection.findFirst, prisma.mcpConnection.updateMany, prisma.mcpToolExecutionLog.create] = original as any;
    if (previousKey === undefined) delete process.env.SMITHERY_API_KEY;
    else process.env.SMITHERY_API_KEY = previousKey;
  });
  return { connection, logs, calls, respond: (next: () => Response) => { response = next; } };
}

test("provider OAuth stays pending across tool refreshes and exposes no URL to calls or logs", async (t) => {
  const f = fixture(t);
  f.respond(() => Response.json({ content: [{ type: "text", text: `Authorization required. Please open ${authUrl}` }] }));
  await assert.rejects(executeTool("org", "connection", "GoogleCalendar_WhoAmI", {
    agentId: "agent-a", callId: "call-a", arguments: {},
  }, { autonomous: true }), (error: any) => error.code === "MCP_AUTH_REQUIRED" && !error.message.includes(authUrl));
  assert.equal(f.connection.status, "AUTH_REQUIRED");
  assert.equal(f.connection.setupUrl, null);
  assert.deepEqual(f.connection.metadata.providerAuthorization.pendingTools, ["GoogleCalendar_WhoAmI"]);
  assert.equal(f.logs[0].status, "auth_required");
  assert.ok(!JSON.stringify([f.logs, f.connection.metadata]).includes("private-state"));
  await refreshConnection("org", "connection");
  assert.equal(f.connection.status, "AUTH_REQUIRED", "listing tools must not approve OAuth");
  const count = f.calls.length;
  await assert.rejects(executeTool("org", "connection", "GoogleCalendar_WhoAmI", { arguments: {} }, { autonomous: true }),
    (error: any) => error.code === "MCP_AUTH_REQUIRED" && error.authorizationUrl === null);
  assert.equal(f.calls.length, count, "calls do not repeatedly generate authorization challenges");
});

test("admin verifies permissions once and subsequent agents reuse the same saved upstream connection", async (t) => {
  const f = fixture(t);
  f.respond(() => Response.json({ authorization: { status: "pending", url: authUrl } }));
  await assert.rejects(executeTool("org", "connection", "GoogleCalendar_WhoAmI", { arguments: {} }, { providerSetup: true }),
    (error: any) => error.authorizationUrl === authUrl);
  f.respond(() => Response.json({ calendars: [{ id: "primary" }] }));
  await executeTool("org", "connection", "GoogleCalendar_WhoAmI", { arguments: {} }, { providerSetup: true });
  assert.equal(f.connection.status, "CONNECTED");
  for (const id of ["first", "second"]) {
    await executeTool("org", "connection", "GoogleCalendar_WhoAmI", { arguments: {}, agentId: id, callId: id }, { autonomous: true });
  }
  assert.equal(new Set(f.calls.map((call) => call.url)).size, 1);
  assert.ok(f.calls.every((call) => call.method === "POST" && call.url.endsWith("/saved-google-account/.tools/GoogleCalendar_WhoAmI")));
  assert.deepEqual(f.connection.metadata.providerAuthorization.verifiedTools, ["GoogleCalendar_WhoAmI"]);
});

test("verifying one tool cannot clear another tool's missing permissions, including concurrent challenges", async (t) => {
  const f = fixture(t);
  f.respond(() => Response.json({ authorizationRequired: true, authorizationUrl: authUrl }));
  await Promise.allSettled(["GoogleCalendar_WhoAmI", "GoogleCalendar_ListCalendars"].map((name) =>
    executeTool("org", "connection", name, { arguments: {} }, { providerSetup: true })));
  assert.equal(f.connection.metadata.providerAuthorization.pendingTools.length, 2);
  f.respond(() => Response.json({ success: true }));
  await executeTool("org", "connection", "GoogleCalendar_WhoAmI", { arguments: {} }, { providerSetup: true });
  assert.equal(f.connection.status, "AUTH_REQUIRED");
  assert.deepEqual(f.connection.metadata.providerAuthorization.pendingTools, ["GoogleCalendar_ListCalendars"]);
  await executeTool("org", "connection", "GoogleCalendar_ListCalendars", { arguments: {} }, { providerSetup: true });
  assert.equal(f.connection.status, "CONNECTED");
});

test("setup never executes a destructive tool, and upstream/semantic errors remain failures", async (t) => {
  const f = fixture(t);
  await assert.rejects(executeTool("org", "connection", "delete_event", { arguments: {} }, { providerSetup: true }),
    (error: any) => error.statusCode === 403);
  assert.equal(f.calls.length, 0);
  for (const [status, body] of [[502, { error: "upstream_error" }], [200, { isError: true, content: [] }]] as const) {
    f.respond(() => Response.json(body, { status }));
    await assert.rejects(executeTool("org", "connection", "GoogleCalendar_WhoAmI", { arguments: {} }, { providerSetup: true }),
      (error: any) => error.statusCode === 502);
  }
  assert.ok(f.logs.every((log) => log.status === "error"));
  assert.equal(f.connection.metadata.providerAuthorization, undefined);
});

test("an in-flight setup test cannot reconnect a connection disconnected by an administrator", async (t) => {
  const f = fixture(t);
  f.respond(() => {
    f.connection.status = "DISCONNECTED";
    return Response.json({ calendars: [] });
  });
  await assert.rejects(executeTool("org", "connection", "GoogleCalendar_WhoAmI", { arguments: {} }, { providerSetup: true }));
  assert.equal(f.connection.status, "DISCONNECTED");
  assert.equal(f.connection.metadata.providerAuthorization, undefined);
});
