import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import prisma from "../../src/config/prisma.js";
import {
  connect,
  refreshConnection,
  executeTool,
  disconnect,
  attach,
  listCatalog,
} from "../../src/modules/mcp/mcp.service.js";

function fixture(t: TestContext) {
  const oldKey = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = `test-${Math.random()}`;
  const state: any = {
    connection: null,
    failSaveAccount: false,
    failTools: false,
    accountStatus: "INITIATED",
    accountUser: null,
    result: { result_type: "completed", data: { calendars: [] } },
    remoteAccounts: [],
    nextPage: false,
  };
  const calls: { path: string; body: any; method: string }[] = [];
  const logs: any[] = [];
  const saved = [
    prisma.mcpConnection.upsert,
    prisma.mcpConnection.findFirst,
    prisma.mcpConnection.updateMany,
    prisma.mcpConnection.findMany,
    prisma.mcpToolExecutionLog.create,
    prisma.$transaction,
    prisma.mcpConnection.deleteMany,
    prisma.agentMcpConnection.deleteMany,
    prisma.agentMcpConnection.upsert,
    prisma.agent.findFirst,
  ];
  prisma.mcpConnection.upsert = (async ({ create }: any) => {
    state.connection ??= {
      ...create,
      mcpConnectionId: "local",
      updatedAt: new Date(),
      providerAccountId: null,
      providerSessionId: null,
      setupLeaseUntil: null,
    };
    return { ...state.connection };
  }) as any;
  prisma.mcpConnection.findFirst = (async ({ where }: any) => {
    if (
      state.connection?.organizationId !== where.organizationId ||
      where.mcpConnectionId !== "local"
    )
      return null;
    if (where.agents && where.agents.some.agentId !== "agent") return null;
    return structuredClone(state.connection);
  }) as any;
  prisma.mcpConnection.updateMany = (async ({ where, data }: any) => {
    if (!state.connection) return { count: 0 };
    if (
      where.updatedAt &&
      where.updatedAt.getTime() !== state.connection.updatedAt.getTime()
    )
      return { count: 0 };
    if (where.OR && state.connection.setupLeaseUntil > new Date())
      return { count: 0 };
    if (state.failSaveAccount && data.providerAccountId) {
      state.failSaveAccount = false;
      throw new Error("database write failed");
    }
    Object.assign(
      state.connection,
      Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
    );
    return { count: 1 };
  }) as any;
  prisma.mcpConnection.findMany = (async () =>
    state.connection ? [state.connection] : []) as any;
  prisma.mcpToolExecutionLog.create = (async ({ data }: any) => {
    logs.push(data);
    return data;
  }) as any;
  prisma.$transaction = (async (items: any[]) => Promise.all(items)) as any;
  prisma.mcpConnection.deleteMany = (async () => {
    state.connection = null;
    return { count: 1 };
  }) as any;
  prisma.agentMcpConnection.deleteMany = (async () => ({ count: 1 })) as any;
  prisma.agentMcpConnection.upsert = (async () => ({
    agentMcpConnectionId: "attached",
  })) as any;
  prisma.agent.findFirst = (async () => ({ agentId: "agent" })) as any;
  let sessions = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(String(url)).origin, "https://backend.composio.dev");
    assert.equal(
      (init?.headers as any)["x-api-key"],
      process.env.COMPOSIO_API_KEY,
    );
    assert.equal(init?.redirect, "error");
    const path = new URL(String(url)).pathname.replace("/api/v3.1", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body, method: init?.method ?? "GET" });
    if (path === "/toolkits")
      return Response.json({
        items: Array.from({ length: 31 }, (_, index) => ({
          slug: `app${index}`,
          name: `App ${index}`,
          type: "native",
          meta: { tools_count: 2 },
        })),
        next_cursor: null,
      });
    if (path === "/toolkits/googlecalendar")
      return Response.json({
        slug: "googlecalendar",
        name: "Calendar",
        type: "native",
        no_auth: false,
      });
    if (path === "/tool_router/session") {
      assert.ok(
        state.connection,
        "local retry handle must precede remote setup",
      );
      assert.deepEqual(body.toolkits, {
        enable: [state.connection.toolkitSlug],
      });
      assert.equal(body.user_id, state.connection.providerUserId);
      assert.equal(body.instant, false);
      assert.deepEqual(body.manage_connections, { enable: false });
      if (body.connected_accounts)
        assert.deepEqual(body.connected_accounts, {
          [state.connection.toolkitSlug]: ["ca_saved"],
        });
      return Response.json({ session_id: `session${++sessions}` });
    }
    if (path === "/custom/toolkits/upsert")
      return Response.json({ slug: `CUSTOM_${body.slug}` });
    if (path === "/custom/toolkits/sync")
      return Response.json({ synced_count: 1, version: "20261029_00" });
    if (path.endsWith("/link")) {
      state.remoteAccounts = [
        {
          id: "ca_saved",
          toolkit: { slug: state.connection.toolkitSlug },
          user_id: state.connection.providerUserId,
          status: state.accountStatus,
        },
      ];
      return Response.json({
        connected_account_id: "ca_saved",
        redirect_url: "https://connect.composio.dev/link/private-token",
      });
    }
    if (path === "/connected_accounts") {
      assert.equal(
        new URL(String(url)).searchParams.get("user_ids"),
        state.connection.providerUserId,
      );
      return Response.json({ items: state.remoteAccounts, next_cursor: null });
    }
    if (init?.method === "DELETE")
      return state.failDelete
        ? Response.json({ error: "unavailable" }, { status: 503 })
        : new Response(null, { status: 204 });
    if (path === "/connected_accounts/ca_saved")
      return Response.json({
        id: "ca_saved",
        status: state.accountStatus,
        toolkit: { slug: state.connection.toolkitSlug },
        user_id: state.accountUser ?? state.connection.providerUserId,
        state: { access_token: "NEVER_STORE_ME" },
      });
    if (path.endsWith("/tools")) {
      if (state.failTools)
        return Response.json({ error: "unavailable" }, { status: 503 });
      return Response.json({
        items: [
          {
            slug: "GOOGLECALENDAR_LIST",
            toolkit: { slug: state.connection.toolkitSlug },
            tags: ["readOnlyHint"],
            input_parameters: {
              type: "object",
              properties: { date: { type: "string", format: "date" } },
              additionalProperties: false,
            },
          },
        ],
        next_cursor: null,
      });
    }
    if (path.endsWith("/execute")) {
      assert.equal(body.account, "ca_saved");
      return Response.json(state.result);
    }
    throw new Error(`Unexpected provider path: ${path}`);
  });
  t.after(() => {
    [
      prisma.mcpConnection.upsert,
      prisma.mcpConnection.findFirst,
      prisma.mcpConnection.updateMany,
      prisma.mcpConnection.findMany,
      prisma.mcpToolExecutionLog.create,
      prisma.$transaction,
      prisma.mcpConnection.deleteMany,
      prisma.agentMcpConnection.deleteMany,
      prisma.agentMcpConnection.upsert,
      prisma.agent.findFirst,
    ] = saved as any;
    if (oldKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = oldKey;
  });
  return {
    state,
    calls,
    logs,
    setup: () => connect("org", "admin", { catalogSlug: "googlecalendar" }),
    activate: async () => {
      state.accountStatus = "ACTIVE";
      await refreshConnection("org", "local");
    },
  };
}

test("Composio OAuth is saved once, refreshed, and reused by subsequent calls without leaking credentials", async (t) => {
  const f = fixture(t);
  const pending = await f.setup();
  assert.equal(pending?.status, "AUTH_REQUIRED");
  const principal = f.state.connection.providerUserId;
  await f.setup();
  assert.equal(f.calls.filter((call) => call.path.endsWith("/link")).length, 1);
  await f.activate();
  assert.equal(f.state.connection.status, "CONNECTED");
  assert.equal(f.state.connection.setupUrl, null);
  assert.equal(f.state.connection.tools[0].requiresConfirmation, false);
  await attach("org", "agent", "local");
  const session = f.state.connection.providerSessionId;
  for (const callId of ["call-a", "call-b"])
    await executeTool(
      "org",
      "local",
      "GOOGLECALENDAR_LIST",
      { agentId: "agent", callId, arguments: {} },
      { autonomous: true },
    );
  assert.equal(f.state.connection.providerUserId, principal);
  assert.ok(
    f.calls
      .filter((call) => call.path.endsWith("/execute"))
      .every((call) => call.path.includes(session)),
  );
  assert.ok(
    !JSON.stringify([f.state.connection, f.logs]).includes("NEVER_STORE_ME"),
  );
  await refreshConnection("org", "local");
  assert.equal(
    f.state.connection.providerSessionId,
    session,
    "ordinary refresh does not replace a session used by active calls",
  );
});

test("a failed local account-ID write recovers the same authorized account without asking for consent again", async (t) => {
  const f = fixture(t);
  f.state.failSaveAccount = true;
  await assert.rejects(f.setup(), /database write failed/);
  f.state.remoteAccounts[0].status = "ACTIVE";
  f.state.accountStatus = "ACTIVE";
  await f.setup();
  assert.equal(f.state.connection.status, "CONNECTED");
  assert.equal(f.calls.filter((call) => call.path.endsWith("/link")).length, 1);
});

test("transient OAuth refresh failure preserves the pending setup link and account", async (t) => {
  const f = fixture(t);
  const pending = await f.setup();
  const provider = globalThis.fetch;
  let fail = true;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (fail && String(url).endsWith("/connected_accounts/ca_saved")) {
      fail = false;
      return Response.json({ error: "unavailable" }, { status: 503 });
    }
    return provider(url, init);
  });
  await refreshConnection("org", "local");
  assert.equal(f.state.connection.setupUrl, pending?.setupUrl);
  const recovered = await f.setup();
  assert.equal(recovered?.status, "AUTH_REQUIRED");
  assert.equal(recovered?.setupUrl, pending?.setupUrl);
  assert.equal(f.calls.filter((call) => call.path.endsWith("/link")).length, 1);
  assert.equal(f.calls.filter((call) => call.method === "DELETE").length, 0);
});

test("Reconnect replaces a pending account with a lost setup link using the same principal", async (t) => {
  const f = fixture(t);
  await f.setup();
  const principal = f.state.connection.providerUserId;
  f.state.connection.setupUrl = null;
  const recovered = await f.setup();
  assert.equal(recovered?.status, "AUTH_REQUIRED");
  assert.ok(recovered?.setupUrl);
  assert.equal(f.state.connection.providerUserId, principal);
  assert.equal(f.calls.filter((call) => call.path.endsWith("/link")).length, 2);
});

test("missing runtime sessions require refresh and recover without consent or replaying the failed call", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.activate();
  const oldSession = f.state.connection.providerSessionId;
  const provider = globalThis.fetch;
  let executions = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("/execute")) executions++;
    if (String(url).includes(`/session/${oldSession}/`))
      return Response.json({ error: "session missing" }, { status: 404 });
    return provider(url, init);
  });
  const execute = () =>
    executeTool(
      "org",
      "local",
      "GOOGLECALENDAR_LIST",
      { agentId: "agent", arguments: {} },
      { autonomous: true },
    );
  await assert.rejects(execute());
  assert.equal(executions, 1);
  assert.equal(f.state.connection.status, "ERROR");
  assert.deepEqual(f.state.connection.tools, []);
  assert.match(f.state.connection.metadata.lastSyncError, /Refresh/);
  await assert.rejects(execute(), /not connected/);
  assert.equal(executions, 1);
  await refreshConnection("org", "local");
  assert.equal(f.state.connection.status, "CONNECTED");
  assert.notEqual(f.state.connection.providerSessionId, oldSession);
  assert.equal(f.state.connection.providerAccountId, "ca_saved");
  assert.equal(f.calls.filter((call) => call.path.endsWith("/link")).length, 1);
  await execute();
  assert.equal(executions, 2);
});

test("a late missing-session response does not overwrite a newer refreshed connection", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.activate();
  const provider = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("/execute")) {
      f.state.connection.updatedAt = new Date(
        f.state.connection.updatedAt.getTime() + 1000,
      );
      f.state.connection.providerSessionId = "replacement";
      return Response.json({ error: "session missing" }, { status: 404 });
    }
    return provider(url, init);
  });
  await assert.rejects(
    executeTool(
      "org",
      "local",
      "GOOGLECALENDAR_LIST",
      { agentId: "agent", arguments: {} },
      { autonomous: true },
    ),
  );
  assert.equal(f.state.connection.status, "CONNECTED");
  assert.equal(f.state.connection.providerSessionId, "replacement");
  assert.equal(f.state.connection.tools.length, 1);
});

test("transient sync failure never deletes a valid account or reports CONNECTED", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.activate();
  f.state.failTools = true;
  const result = await f.setup();
  assert.equal(result?.status, "ERROR");
  assert.deepEqual(result?.tools, []);
  assert.equal(
    f.calls.filter(
      (call) =>
        call.method === "DELETE" && call.path.includes("connected_accounts"),
    ).length,
    0,
  );
});

test("expired consent requires an admin reconnect and preserves the stable principal", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.activate();
  const principal = f.state.connection.providerUserId;
  f.state.accountStatus = "EXPIRED";
  await refreshConnection("org", "local");
  assert.equal(f.state.connection.status, "AUTH_REQUIRED");
  assert.equal(f.state.connection.setupUrl, null);
  f.state.remoteAccounts = [];
  f.state.accountStatus = "INITIATED";
  await f.setup();
  assert.equal(f.state.connection.providerUserId, principal);
  assert.equal(f.calls.filter((call) => call.path.endsWith("/link")).length, 2);
});

test("tenant and agent ownership, schema, legacy, and setup-lock failures never execute a tool", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.activate();
  await assert.rejects(
    executeTool("other-org", "local", "GOOGLECALENDAR_LIST", { arguments: {} }),
  );
  await assert.rejects(
    executeTool("org", "local", "GOOGLECALENDAR_LIST", {
      agentId: "other-agent",
      arguments: {},
    }),
  );
  await assert.rejects(
    executeTool("org", "local", "GOOGLECALENDAR_LIST", {
      arguments: { invented: true },
    }),
    (error: any) => error.code === "MCP_ARGUMENTS_INVALID",
  );
  f.state.connection.setupLeaseUntil = new Date(Date.now() + 60_000);
  await assert.rejects(f.setup(), /already in progress/);
  f.state.connection.setupLeaseUntil = null;
  f.state.connection.provider = "smithery";
  await assert.rejects(
    executeTool("org", "local", "GOOGLECALENDAR_LIST", { arguments: {} }),
    /Reconnect/,
  );
  await assert.rejects(attach("org", "agent", "local"), /Reconnect/);
  assert.equal(
    f.calls.filter((call) => call.path.endsWith("/execute")).length,
    0,
  );
});

test("provider identity mismatch cannot activate an account and logout removes remote handles first", async (t) => {
  const f = fixture(t);
  await f.setup();
  f.state.accountStatus = "ACTIVE";
  f.state.accountUser = "another-tenant";
  await refreshConnection("org", "local");
  assert.equal(f.state.connection.status, "ERROR");
  await disconnect("org", "local");
  assert.equal(f.state.connection, null);
  assert.ok(
    f.calls.some(
      (call) =>
        call.method === "DELETE" &&
        call.path === "/connected_accounts/ca_saved",
    ),
  );
});

test("provider auth challenges remain pending across refresh and never appear in call logs", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.activate();
  f.state.result = {
    authorizationRequired: true,
    authorizationUrl: "https://connect.composio.dev/link/private-token",
  };
  await assert.rejects(
    executeTool(
      "org",
      "local",
      "GOOGLECALENDAR_LIST",
      { agentId: "agent", arguments: {} },
      { autonomous: true },
    ),
    (error: any) => error.code === "MCP_AUTH_REQUIRED",
  );
  await refreshConnection("org", "local");
  assert.equal(f.state.connection.status, "AUTH_REQUIRED");
  assert.ok(!JSON.stringify(f.logs).includes("private-token"));
});

test("marketplace returns the provider catalog beyond the original four entries", async (t) => {
  fixture(t);
  const catalog = await listCatalog("org", {
    page: 2,
    pageSize: 24,
    sort: "popular",
  });
  assert.equal(catalog.pagination.totalCount, 31);
  assert.equal(catalog.items.length, 7);
  assert.ok(catalog.items.every((item) => item.provider === "composio"));
});

test("custom MCP registration is scoped to the organization and explicit auth mode", async (t) => {
  const f = fixture(t);
  await connect("org", "admin", {
    customUrl: "https://8.8.8.8/mcp",
    authMode: "none",
    displayName: "Custom",
  });
  const registration = f.calls.find(
    (call) => call.path === "/custom/toolkits/upsert",
  )!;
  assert.match(registration.body.slug, /^QV_[A-F0-9]{64}$/);
  assert.deepEqual(registration.body.toolkit_config.auth_schemes, [
    { mode: "NO_AUTH" },
  ]);
  assert.equal(f.state.connection.status, "CONNECTED");
  assert.equal(f.calls.filter((call) => call.path.endsWith("/link")).length, 0);
  await assert.rejects(
    connect("org", "admin", { catalogSlug: f.state.connection.toolkitSlug }),
    /not found/,
  );
  await assert.rejects(
    connect("org", "admin", {
      customUrl: "https://127.0.0.1/mcp",
      authMode: "none",
    }),
    /Private or local/,
  );
});

test("custom bearer credentials are collected by Composio, never in the QuickVoice request", async (t) => {
  const f = fixture(t);
  await connect("org", "admin", {
    customUrl: "https://8.8.8.8/mcp",
    authMode: "api_key",
  });
  const registration = f.calls.find(
    (call) => call.path === "/custom/toolkits/upsert",
  )!;
  assert.deepEqual(registration.body.toolkit_config.auth_schemes, [
    {
      mode: "API_KEY",
      headers: { Authorization: "Bearer {{generic_api_key}}" },
    },
  ]);
  assert.equal(f.state.connection.status, "AUTH_REQUIRED");
});

test("failed remote disconnect blocks execution and retains handles for retry", async (t) => {
  const f = fixture(t);
  await f.setup();
  await f.activate();
  f.state.failDelete = true;
  await assert.rejects(disconnect("org", "local"));
  assert.equal(f.state.connection.status, "DISCONNECTED");
  assert.equal(f.state.connection.providerAccountId, "ca_saved");
  await assert.rejects(
    executeTool("org", "local", "GOOGLECALENDAR_LIST", { arguments: {} }),
  );
  f.state.failDelete = false;
  await disconnect("org", "local");
  assert.equal(f.state.connection, null);
});

test("disconnect also removes a grant whose account-ID save failed", async (t) => {
  const f = fixture(t);
  f.state.failSaveAccount = true;
  await assert.rejects(f.setup());
  assert.equal(f.state.connection.providerAccountId, null);
  await disconnect("org", "local");
  assert.ok(
    f.calls.some(
      (call) =>
        call.method === "DELETE" &&
        call.path === "/connected_accounts/ca_saved",
    ),
  );
  assert.equal(f.state.connection, null);
});

test("custom OAuth registers the supplied authorization-server discovery URL", async (t) => {
  const f = fixture(t);
  await connect("org", "admin", {
    customUrl: "https://8.8.8.8/mcp",
    authMode: "oauth",
    discoveryUrl: "https://8.8.8.8/.well-known/oauth-authorization-server",
  });
  const registration = f.calls.find(
    (call) => call.path === "/custom/toolkits/upsert",
  )!;
  assert.deepEqual(registration.body.toolkit_config.auth_schemes, [
    {
      mode: "DCR_OAUTH",
      discovery_url: "https://8.8.8.8/.well-known/oauth-authorization-server",
    },
  ]);
  assert.equal(f.state.connection.status, "AUTH_REQUIRED");
});
