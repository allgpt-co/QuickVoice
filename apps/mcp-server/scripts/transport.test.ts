import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("SDK client works when the optional background SSE stream is declined", { timeout: 10_000 }, async (t) => {
  const previousEnv = {
    PORT: process.env.PORT,
    QUICKVOICE_API_BASE_URL: process.env.QUICKVOICE_API_BASE_URL,
    MCP_MAX_SESSIONS_PER_KEY: process.env.MCP_MAX_SESSIONS_PER_KEY,
  };
  Object.assign(process.env, {
    PORT: "0",
    QUICKVOICE_API_BASE_URL: "https://quickvoice.test/api/v1",
    MCP_MAX_SESSIONS_PER_KEY: "1",
  });
  const realFetch = globalThis.fetch;
  const stalledUpstream = createServer((req, res) => {
    if (req.url === "/body") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"data":');
    }
    // Leave headers or JSON unfinished until the MCP deadline/cancellation aborts it.
  });
  stalledUpstream.listen(0, "127.0.0.1");
  await once(stalledUpstream, "listening");
  t.after(async () => {
    stalledUpstream.closeAllConnections();
    await new Promise<void>((resolve) => stalledUpstream.close(() => resolve()));
  });
  const stalledPort = (stalledUpstream.address() as AddressInfo).port;
  let upstreamStall: "headers" | "body" | undefined;
  let upstreamSignal: AbortSignal | null | undefined;
  let upstreamStarted: (() => void) | undefined;
  let stalledRequests = 0;
  let shortenDeadline = true;
  const realTimeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) =>
    realTimeout(milliseconds === 30_000 && shortenDeadline ? 50 : milliseconds),
  );
  const internalDetail = "TEST_PRIVATE_DETAIL: database.internal:5432 password=fixture-secret /srv/private.ts";
  const upstreamRequests: string[] = [];
  let upstreamFailure: number | "network" | undefined;
  t.mock.method(globalThis, "fetch", async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (String(input).startsWith("https://quickvoice.test/api/v1")) upstreamRequests.push(String(input));
    if (String(input) === "https://quickvoice.test/api/v1/agents") {
      if (upstreamStall) {
        upstreamSignal = init?.signal;
        stalledRequests++;
        if (upstreamStall === "headers") upstreamStarted?.();
        const response = await realFetch(`http://127.0.0.1:${stalledPort}/${upstreamStall}`, init);
        if (upstreamStall === "body") upstreamStarted?.();
        return response;
      }
      if (upstreamFailure === "network") throw new Error(internalDetail);
      if (upstreamFailure) {
        return new Response(
          upstreamFailure === 502 ? `<html>${internalDetail}</html>` : JSON.stringify({ message: internalDetail }),
          { status: upstreamFailure, headers: { "content-type": upstreamFailure === 502 ? "text/html" : "application/json" } },
        );
      }
      const headers = new Headers(init?.headers);
      const valid = ["transport-test-placeholder", "different-key"].includes(headers.get("x-api-key") ?? "");
      return new Response(
        JSON.stringify({ success: valid, data: { message: "Booked for 2026-10-01", order_id: "12345678901" } }),
        {
          status: valid ? 200 : 401,
          headers: { "content-type": "application/json" },
        },
      );
    }
    if (String(input).startsWith("https://quickvoice.test/api/v1")) {
      return new Response(JSON.stringify({ success: true, data: null }), {
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  });
  const { httpServer } = await import("../src/index.js");

  const client = new Client({ name: "transport-regression", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  if (!httpServer.listening) await once(httpServer, "listening");
  const address = httpServer.address() as AddressInfo;
  const endpoint = new URL(process.env.MCP_ENDPOINT_PATH ?? "/mcp", `http://127.0.0.1:${address.port}`);

  for (const method of ["GET", "POST"]) {
    const response = await fetch(endpoint, { method, signal: AbortSignal.timeout(2_000) });
    assert.equal(response.status, 401, `${method} still requires an API key`);
    await response.text();
  }

  const initializeBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "security-test", version: "1.0.0" },
    },
  };
  const invalidInitialize = await realFetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "x-api-key": "invalid-key",
    },
    body: JSON.stringify(initializeBody),
  });
  assert.equal(invalidInitialize.status, 401, "invalid keys cannot allocate sessions");
  const health = await (await realFetch(new URL("/health", endpoint))).json() as {
    activeSessions: number;
  };
  assert.equal(health.activeSessions, 0);

  let resolveGet!: (value: { status: number; allow: string | null } | Error) => void;
  const backgroundGet = new Promise<{ status: number; allow: string | null } | Error>((resolve) => {
    resolveGet = resolve;
  });
  const clientErrors: Error[] = [];
  client.onerror = (error) => clientErrors.push(error);
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { "x-api-key": "transport-test-placeholder" } },
    fetch: async (input, init) => {
      try {
        const response = await fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(2_000),
          ]),
        });
        if (init?.method === "GET") {
          resolveGet({ status: response.status, allow: response.headers.get("allow") });
        }
        return response;
      } catch (error) {
        if (init?.method === "GET") resolveGet(error as Error);
        throw error;
      }
    },
  });

  await client.connect(transport);
  assert.ok(transport.sessionId, "initialization creates a session");
  await t.test("valid initialization key checks use the short cache", async () => {
    const { validateQuickVoiceApiKey } = await import("../src/api-client.js");
    const before = upstreamRequests.length;
    assert.equal(await validateQuickVoiceApiKey("transport-test-placeholder"), true);
    assert.equal(upstreamRequests.length, before);
  });
  assert.deepEqual(await backgroundGet, { status: 405, allow: "POST, DELETE" });
  const tools = await client.listTools();
  assert.ok(tools.tools.length > 0, "tool discovery still works after the GET probe");
  for (const toolName of ["delete_agent", "create_quick_outbound_call", "update_tool"]) {
    const tool = tools.tools.find((candidate) => candidate.name === toolName);
    assert.equal(tool?.annotations?.readOnlyHint, false, `${toolName} is marked as a mutation`);
    assert.equal(tool?.annotations?.destructiveHint, true, `${toolName} requires destructive-action handling`);
  }
  const catalog = await client.readResource({ uri: "quickvoice://api_catalog" });
  assert.ok(catalog.contents.length > 0, "catalog reads still work");
  assert.deepEqual(clientErrors, [], "the SDK treats GET 405 as supported behavior");

  await t.test("dot-segment parameters are rejected before any upstream request", async () => {
    const requestsBefore = upstreamRequests.length;
    for (const value of [".", ".."]) {
      for (const input of [
        { name: "delete_agent", arguments: { agentId: value } },
        { name: "save_agent_config", arguments: { agentId: value, body: {} } },
        { name: "attach_tool_to_agent", arguments: { toolId: value, agentId: "valid-agent" } },
        { name: "attach_tool_to_agent", arguments: { toolId: "valid-tool", agentId: value } },
      ]) {
        const result = await client.callTool(input);
        assert.equal(result.isError, true, `${input.name} must reject ${value}`);
        assert.match(JSON.stringify(result.content), /Invalid path parameter/);
      }
      await assert.rejects(client.readResource({ uri: `quickvoice://get_call_log/${value}` }));
    }
    assert.equal(upstreamRequests.length, requestsBefore, "invalid paths must never reach the API");
  });

  await t.test("valid identifiers retain dots and reserved characters within their path segment", async () => {
    for (const agentId of ["agent-123", ".agent", "agent..v2", "%2e%2e", "../billing", "a/b?x#y"]) {
      const before = upstreamRequests.length;
      const result = await client.callTool({ name: "delete_agent", arguments: { agentId } });
      assert.notEqual(result.isError, true);
      assert.equal(upstreamRequests.length, before + 1);
      assert.equal(upstreamRequests.at(-1), `https://quickvoice.test/api/v1/agents/${encodeURIComponent(agentId)}`);
    }
    await client.readResource({ uri: "quickvoice://get_call_log/call..123" });
    assert.equal(upstreamRequests.at(-1), "https://quickvoice.test/api/v1/calls/call..123");
  });

  for (const method of ["POST", "DELETE"]) {
    for (const key of [undefined, "different-key"]) {
      const wrongKeyResponse = await realFetch(endpoint, {
        method,
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-session-id": transport.sessionId!,
          ...(key ? { "x-api-key": key } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) } : {}),
      });
      assert.equal(wrongKeyResponse.status, 401, `${method} cannot use another key's session`);
      await wrongKeyResponse.text();
    }
  }
  assert.ok((await client.listTools()).tools.length, "rejected requests leave the owner's session usable");

  const overCapacity = await realFetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "x-api-key": "transport-test-placeholder",
    },
    body: JSON.stringify(initializeBody),
  });
  assert.equal(overCapacity.status, 429, "per-key session capacity is enforced");

  for (const failure of [400, 401, 403, 429, 500, 502, "network"] as const) {
    await t.test(`tool and resource errors hide upstream details (${failure})`, async () => {
      upstreamFailure = failure;
      const safeMessage = failure === "network"
        ? "QuickVoice API request failed. Please try again."
        : `QuickVoice API request failed with HTTP ${failure}`;
      const result = await client.callTool({ name: "create_agent", arguments: { body: { name: "Test" } } });
      assert.equal(result.isError, true);
      assert.deepEqual(result.content, [{ type: "text", text: safeMessage }]);
      assert.ok(!JSON.stringify(result).includes(internalDetail));
      await assert.rejects(client.readResource({ uri: "quickvoice://list_agents" }), (error: Error) => {
        assert.ok(error.message.includes(safeMessage));
        assert.ok(!error.message.includes(internalDetail));
        assert.ok(!JSON.stringify(error).includes(internalDetail));
        return true;
      });
    });
  }
  upstreamFailure = undefined;

  for (const stage of ["headers", "body"] as const) {
    await t.test(`deadline aborts stalled ${stage} for tools and resources without retrying`, async () => {
      upstreamStall = stage;
      const requestsBefore = stalledRequests;
      const result = await client.callTool({ name: "create_agent", arguments: { body: { name: "Test" } } });
      assert.equal(result.isError, true);
      assert.deepEqual(result.content, [{ type: "text", text: "QuickVoice API request timed out. Check the operation status before retrying." }]);
      assert.equal(upstreamSignal?.aborted, true);
      await assert.rejects(client.readResource({ uri: "quickvoice://list_agents" }), /QuickVoice API request timed out/);
      assert.equal(upstreamSignal?.aborted, true);
      assert.equal(stalledRequests - requestsBefore, 2, "one upstream request per MCP operation; no retries");
    });
    for (const operation of ["tool", "resource"] as const) {
      await t.test(`MCP cancellation aborts ${operation} while waiting for ${stage}`, async () => {
        shortenDeadline = false;
        upstreamStall = stage;
        const started = new Promise<void>((resolve) => { upstreamStarted = resolve; });
        const controller = new AbortController();
        const request = operation === "tool"
          ? client.callTool({ name: "create_agent", arguments: { body: { name: "Test" } } }, undefined, { signal: controller.signal })
          : client.readResource({ uri: "quickvoice://list_agents" }, { signal: controller.signal });
        const rejected = assert.rejects(request);
        await started;
        assert.ok(upstreamSignal, "the upstream fetch receives a cancellation signal");
        const aborted = once(upstreamSignal, "abort", { signal: realTimeout(1_000) });
        controller.abort();
        await rejected;
        await aborted;
        assert.equal(upstreamSignal.aborted, true);
        upstreamStarted = undefined;
        shortenDeadline = true;
      });
    }
  }
  upstreamStall = undefined;
  const success = await client.callTool({ name: "create_agent", arguments: { body: { name: "Test" } } });
  assert.notEqual(success.isError, true);
  assert.deepEqual(success.content, [{
    type: "text", text: JSON.stringify({ message: "Booked for 2026-10-01", order_id: "12345678901" }, null, 2),
  }], "successful results are not redacted or rewritten");

  await transport.terminateSession();
  assert.equal(transport.sessionId, undefined, "the session can still be terminated");
  const healthAfterClose = await (await realFetch(new URL("/health", endpoint))).json() as {
    activeSessions: number;
  };
  assert.equal(healthAfterClose.activeSessions, 0, "terminated sessions release capacity");

  const realNow = Date.now;
  let clock = realNow() + 61_000;
  t.mock.method(Date, "now", () => clock);
  for (const failure of [500, "network"] as const) {
    upstreamFailure = failure;
    const response = await realFetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "transport-test-placeholder",
      },
      body: JSON.stringify(initializeBody),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "MCP request failed" });
  }
  upstreamFailure = undefined;
  clock += 61_000;
  const initialize = (key: string) => realFetch(endpoint, {
    method: "POST", headers: { accept: "application/json, text/event-stream", "content-type": "application/json", "x-api-key": key, "x-forwarded-for": `192.0.2.${Math.random()}` },
    body: JSON.stringify(initializeBody),
  });
  const beforeChecks = upstreamRequests.length;
  for (let attempt = 0; attempt < 20; attempt++) {
    assert.equal((await initialize("junk-key")).status, 401);
  }
  assert.equal(upstreamRequests.length - beforeChecks, 1, "negative cache prevents repeated upstream checks");
  const limited = await initialize("fresh-junk-key");
  assert.equal(limited.status, 429, "spoofed XFF does not change direct-client bucket");
  assert.equal(limited.headers.get("retry-after"), "60");
  clock += 61_000;
  assert.equal((await initialize("junk-key")).status, 401);
  assert.equal(upstreamRequests.length - beforeChecks, 2, "expired cache revalidates");
});
