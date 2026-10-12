import assert from "node:assert/strict";
import { test } from "node:test";
import prisma from "../../src/config/prisma.js";
import { connect, refreshConnection } from "../../src/modules/mcp/mcp.service.js";

test("a remote MCP grant is not created before its local retry handle", async (t) => {
  const previousKey = process.env.SMITHERY_API_KEY;
  process.env.SMITHERY_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.SMITHERY_API_KEY;
    else process.env.SMITHERY_API_KEY = previousKey;
  });
  const originalUpsert = prisma.mcpConnection.upsert;
  const originalUpdate = prisma.mcpConnection.updateMany;
  let handleCreated = false;
  let finalStatus = "";
  prisma.mcpConnection.upsert = (async () => {
    handleCreated = true;
    return { mcpConnectionId: "local-123" };
  }) as any;
  prisma.mcpConnection.updateMany = (async ({ data }: any) => {
    finalStatus = data.status;
    return { count: 1 };
  }) as any;
  t.after(() => {
    prisma.mcpConnection.upsert = originalUpsert;
    prisma.mcpConnection.updateMany = originalUpdate;
  });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options?.method === "PUT") {
      assert.ok(handleCreated);
      return Response.json({ message: "private provider token: secret" }, { status: 503 });
    }
    return Response.json({ namespaces: [{ name: "workspace" }] });
  });

  await assert.rejects(connect("org_123", null, { customUrl: "https://8.8.8.8/mcp" }),
    /Could not connect to the MCP endpoint/);
  assert.equal(finalStatus, "ERROR");
});

test("a failed tool sync cannot turn a connection into CONNECTED", async (t) => {
  const previousKey = process.env.SMITHERY_API_KEY;
  process.env.SMITHERY_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.SMITHERY_API_KEY;
    else process.env.SMITHERY_API_KEY = previousKey;
  });
  const connection = {
    mcpConnectionId: "conn_123", organizationId: "org_123", userId: null,
    status: "PENDING", displayName: "CRM", mcpUrl: "https://example.com/mcp",
    smitheryNamespace: "workspace", smitheryConnectionId: "remote-123",
    metadata: {}, lastSyncedAt: null, setupUrl: null,
  };
  const originalFind = prisma.mcpConnection.findFirst;
  const originalUpdate = prisma.mcpConnection.updateMany;
  const writes: any[] = [];
  prisma.mcpConnection.findFirst = (async () => connection) as any;
  prisma.mcpConnection.updateMany = (async (args: any) => {
    writes.push(args.data);
    Object.assign(connection, args.data);
    return { count: 1 };
  }) as any;
  t.after(() => {
    prisma.mcpConnection.findFirst = originalFind;
    prisma.mcpConnection.updateMany = originalUpdate;
  });
  t.mock.method(globalThis, "fetch", async (_url, options) =>
    options?.method === "PUT"
      ? Response.json({ status: "connected" })
      : Response.json({ message: "private provider token: secret" }, { status: 503 }));

  await refreshConnection("org_123", "conn_123");
  assert.equal(writes[0].status, "ERROR");
  assert.equal(writes[0].metadata.lastSyncError, "Could not sync MCP tools");
  assert.equal(writes[0].lastSyncedAt, null);
  assert.deepEqual(writes[0].tools, []);
});
