import assert from "node:assert/strict";
import test from "node:test";
import prisma from "../../src/config/prisma.js";
import { attach } from "../../src/modules/mcp/mcp.service.js";

for (const scenario of ["legacy", "annotated", "outage"] as const) {
  test(`MCP attachment annotation refresh: ${scenario}`, async (t) => {
    const previousKey = process.env.SMITHERY_API_KEY;
    process.env.SMITHERY_API_KEY = "test-only-key";
    t.after(() => {
      if (previousKey === undefined) delete process.env.SMITHERY_API_KEY;
      else process.env.SMITHERY_API_KEY = previousKey;
    });
    const connection = {
      mcpConnectionId: "connection_123", status: "CONNECTED",
      smitheryNamespace: "namespace", smitheryConnectionId: "connection",
      tools: [{ name: "list_files", ...(scenario === "annotated" ? { annotations: { readOnlyHint: true } } : {}) }],
    };
    const writes: any[] = [];
    const originals = [prisma.agent.findFirst, prisma.mcpConnection.findFirst,
      prisma.agentMcpConnection.upsert, prisma.mcpConnection.updateMany] as const;
    prisma.agent.findFirst = (async () => ({ agentId: "agent_123" })) as any;
    prisma.mcpConnection.findFirst = (async ({ where }: any) => {
      assert.equal(where.organizationId, "org_123");
      return connection;
    }) as any;
    prisma.agentMcpConnection.upsert = (async () => ({ agentMcpConnectionId: "attachment_123" })) as any;
    prisma.mcpConnection.updateMany = (async (args: any) => { writes.push(args); return { count: 1 }; }) as any;
    t.after(() => {
      [prisma.agent.findFirst, prisma.mcpConnection.findFirst,
        prisma.agentMcpConnection.upsert, prisma.mcpConnection.updateMany] = originals;
    });
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(
      scenario === "outage" ? { message: "unavailable" } : { tools: [{ name: "list_files", annotations: { readOnlyHint: true } }] },
      { status: scenario === "outage" ? 503 : 200 },
    ));
    const result = await attach("org_123", "agent_123", "connection_123");
    assert.equal(result.agentMcpConnectionId, "attachment_123");
    assert.equal(fetch.mock.callCount(), scenario === "annotated" ? 0 : 1);
    assert.equal(writes.length, scenario === "legacy" ? 1 : 0);
    if (scenario === "legacy") {
      assert.equal(writes[0].data.tools[0].requiresConfirmation, false);
      assert.equal(writes[0].data.tools[0].annotations.readOnlyHint, true);
    }
    if (scenario === "outage") assert.deepEqual(connection.tools, [{ name: "list_files" }]);
  });
}
