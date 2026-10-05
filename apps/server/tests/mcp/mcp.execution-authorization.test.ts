import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import { requestJson } from "../helpers/http-client.js";

const originalEnv = { ...process.env };
const internalKey = "mcp-authorization-test-internal-key";
let server: Server;
let baseUrl: string;
let restorePrisma = () => {};
let providerCalls: string[] = [];
let connectionLookups = 0;
let executionLogs = 0;

before(async () => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    BETTER_AUTH_URL: "http://localhost:5000",
    BETTER_AUTH_SECRET: "test-secret-with-adequate-length-32chars",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    INTERNAL_API_KEY: internalKey,
    SMITHERY_API_KEY: "local-test-only",
    SMITHERY_API_BASE_URL: "https://smithery.invalid",
  });
  const { auth } = await import("../../src/lib/auth.js");
  const { roles, ac } = await import("../../src/lib/permissions.js");
  const { ORGANIZATION_API_KEY_PERMISSIONS } = await import("../../src/middleware/api-key-auth.js");
  const { default: prisma } = await import("../../src/config/prisma.js");
  const { default: router } = await import("../../src/modules/mcp/mcp.route.js");
  const { default: errorHandler } = await import("../../src/middleware/error.middleware.js");
  const testRoles = { ...roles, editor: ac.newRole({ tools: ["read", "update"] }) };

  mock.method(auth.api, "getSession", async ({ headers }: { headers: Headers }) => {
    const role = headers.get("cookie")?.replace("role=", "");
    return role && role in testRoles
      ? { user: { id: `user-${role}` }, session: { activeOrganizationId: "org-test" } }
      : null;
  });
  mock.method(auth.api, "hasPermission", async ({ headers, body }: any) => {
    assert.equal(body.organizationId, "org-test");
    const role = headers.get("cookie")?.replace("role=", "") as keyof typeof testRoles;
    return testRoles[role]?.authorize(body.permissions) ?? { success: false };
  });
  mock.method(auth.api, "verifyApiKey", async ({ body }: any) => ({
    valid: true,
    key: {
      id: "key-test", referenceId: "org-test",
      permissions: body.key === "overbroad-key"
        ? { tools: ["read", "execute", "*"], "*": ["*"] }
        : ORGANIZATION_API_KEY_PERMISSIONS,
      metadata: { permissions: { tools: ["execute"] } },
    },
  }));
  mock.method(globalThis, "fetch", async (url: any) => {
    assert.match(String(url), /^https:\/\/smithery\.invalid\/connect\/test-namespace\/test-connection\/\.tools\//);
    providerCalls.push(String(url).split("/").pop()!);
    return new Response(JSON.stringify({ simulated: true }), { status: 200 });
  });

  // Prisma delegates are proxies, so restore assignments explicitly.
  const findConnection = prisma.mcpConnection.findFirst;
  const listConnections = prisma.mcpConnection.findMany;
  const listAgentConnections = prisma.agentMcpConnection.findMany;
  const findMember = prisma.member.findFirst;
  const createLog = prisma.mcpToolExecutionLog.create;
  const executeRaw = prisma.$executeRaw;
  prisma.mcpConnection.findFirst = (async ({ where }: any) => {
    connectionLookups++;
    assert.equal(where.organizationId, "org-test");
    if (where.mcpConnectionId !== "connection-test") return null;
    if (where.agents) {
      assert.equal(where.agents.some.enabled, true);
      if (where.agents.some.agentId !== "agent-test") return null;
    }
    return {
      status: "CONNECTED",
      smitheryNamespace: "test-namespace",
      smitheryConnectionId: "test-connection",
      mcpUrl: "https://example.invalid/mcp",
      tools: [
        { name: "list_files", annotations: { readOnlyHint: true } },
        { name: "delete_file", annotations: { destructiveHint: true } },
        { name: "send_email", requiresConfirmation: true },
      ],
    };
  }) as any;
  const legacyConnection = { mcpConnectionId: "legacy", tools: [
    { name: "legacy_tool" },
    { name: "list_files", annotations: { readOnlyHint: true } },
  ] };
  prisma.mcpConnection.findMany = (async () => [legacyConnection]) as any;
  prisma.agentMcpConnection.findMany = (async () => [{ mcpConnection: legacyConnection }]) as any;
  prisma.member.findFirst = (async () => ({ userId: "org-owner" })) as any;
  prisma.mcpToolExecutionLog.create = (async () => { executionLogs++; return {}; }) as any;
  prisma.$executeRaw = (async () => 1) as any;
  restorePrisma = () => {
    prisma.mcpConnection.findFirst = findConnection;
    prisma.mcpConnection.findMany = listConnections;
    prisma.agentMcpConnection.findMany = listAgentConnections;
    prisma.member.findFirst = findMember;
    prisma.mcpToolExecutionLog.create = createLog;
    prisma.$executeRaw = executeRaw;
  };

  const app = express();
  app.use(express.json());
  app.use("/api/v1/mcp", router);
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1/mcp`;
});

beforeEach(() => {
  providerCalls = [];
  connectionLookups = 0;
  executionLogs = 0;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  restorePrisma();
  mock.restoreAll();
  process.env = originalEnv;
});

const execute = (headers: Record<string, string>, tool: string, input = {}, connection = "connection-test") =>
  requestJson(`${baseUrl}/connections/${connection}/tools/${tool}/execute`, {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ arguments: {}, ...input }),
  });

test("members, config editors, and organization API keys cannot execute any remote tool", async () => {
  const callers: Record<string, string>[] = [
    { cookie: "role=member" }, { cookie: "role=editor" },
    { "x-api-key": "read-only-key" }, { "x-api-key": "overbroad-key" },
  ];
  for (const headers of callers) {
    for (const tool of ["delete_file", "send_email", "list_files"]) {
      const response = await execute(headers, tool, { agentId: "agent-test" });
      assert.equal(response.status, 403, `${JSON.stringify(headers)}: ${tool}`);
      if (headers["x-api-key"]) {
        assert.equal((await response.json()).message, "Organization API keys cannot execute connected MCP tools");
      }
    }
    assert.equal((await requestJson(`${baseUrl}/connections`, { headers })).status, 200, "read access remains available");
  }
  assert.equal(connectionLookups, 0, "deny before loading an OAuth connection");
  assert.equal(executionLogs, 0);
  assert.deepEqual(providerCalls, []);
});

test("owner and admin sessions retain execution permission", async () => {
  for (const role of ["owner", "admin"]) {
    const response = await execute({ cookie: `role=${role}` }, "delete_file");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.simulated, true);
  }
  assert.deepEqual(providerCalls, ["delete_file", "delete_file"]);
  assert.equal(executionLogs, 2);
});

test("trusted AI execution retains its enabled agent-connection check", async () => {
  const headers = { authorization: `Bearer ${internalKey}`, "x-user-id": "worker", "x-organization-id": "org-test" };
  assert.equal((await execute(headers, "list_files", { agentId: "agent-test" })).status, 200);
  assert.equal((await execute(headers, "delete_file", { agentId: "agent-test" })).status, 403);
  assert.equal((await execute(headers, "send_email", { agentId: "agent-test" })).status, 403);
  assert.equal((await execute(headers, "unknown_tool", { agentId: "agent-test" })).status, 404);
  assert.equal((await execute(headers, "list_files", { agentId: "unattached-agent" })).status, 404);
  assert.deepEqual(providerCalls, ["list_files"]);
});

test("missing credentials and another organization's connection never reach the provider", async () => {
  assert.equal((await execute({}, "delete_file")).status, 401);
  assert.equal((await execute({ cookie: "role=admin" }, "delete_file", {}, "foreign-connection")).status, 404);
  assert.deepEqual(providerCalls, []);
});


test("connection and agent lists label legacy tools without a remote resync", async () => {
  const headers = { cookie: "role=admin" };
  for (const path of ["/connections", "/agent/agent-test"]) {
    const response = await requestJson(`${baseUrl}${path}`, { headers });
    assert.equal(response.status, 200);
    const item = (await response.json()).data[0];
    const tools = (item.mcpConnection ?? item).tools;
    assert.deepEqual(tools.map((tool: any) => [tool.name, tool.requiresConfirmation]), [
      ["legacy_tool", true], ["list_files", false],
    ]);
  }
  assert.deepEqual(providerCalls, []);
});
