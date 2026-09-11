import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("SDK client works when the optional background SSE stream is declined", { timeout: 10_000 }, async (t) => {
  const previousPort = process.env.PORT;
  process.env.PORT = "0";
  const { httpServer } = await import("../src/index.js");
  if (previousPort === undefined) delete process.env.PORT;
  else process.env.PORT = previousPort;

  const client = new Client({ name: "transport-regression", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
  });
  if (!httpServer.listening) await once(httpServer, "listening");
  const address = httpServer.address() as AddressInfo;
  const endpoint = new URL(process.env.MCP_ENDPOINT_PATH ?? "/mcp", `http://127.0.0.1:${address.port}`);

  for (const method of ["GET", "POST"]) {
    const response = await fetch(endpoint, { method, signal: AbortSignal.timeout(2_000) });
    assert.equal(response.status, 401, `${method} still requires an API key`);
    await response.text();
  }

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
  assert.deepEqual(await backgroundGet, { status: 405, allow: "POST, DELETE" });
  const tools = await client.listTools();
  assert.ok(tools.tools.length > 0, "tool discovery still works after the GET probe");
  const catalog = await client.readResource({ uri: "quickvoice://api_catalog" });
  assert.ok(catalog.contents.length > 0, "catalog reads still work");
  assert.deepEqual(clientErrors, [], "the SDK treats GET 405 as supported behavior");
  await transport.terminateSession();
  assert.equal(transport.sessionId, undefined, "the session can still be terminated");
});
