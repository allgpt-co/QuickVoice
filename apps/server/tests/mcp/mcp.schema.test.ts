import assert from "node:assert/strict";
import { test } from "node:test";

import { connectMcpSchema } from "../../src/modules/mcp/mcp.schema.js";

test("custom MCP connection accepts HTTPS MCP and legacy SSE endpoints", () => {
  assert.equal(
    connectMcpSchema.safeParse({
      customUrl: "https://server.example.com/mcp",
      displayName: "Internal tools",
    }).success,
    true
  );
  assert.equal(
    connectMcpSchema.safeParse({
      customUrl: "https://demo-day.mcp.cloudflare.com/sse",
    }).success,
    true
  );
});

test("custom MCP connection rejects insecure and credential-bearing URLs", () => {
  const insecure = connectMcpSchema.safeParse({
    customUrl: "http://server.example.com/mcp",
  });
  const credentials = connectMcpSchema.safeParse({
    customUrl: "https://token@server.example.com/mcp",
  });

  assert.equal(insecure.success, false);
  assert.match(JSON.stringify(insecure.error), /must use HTTPS/);
  assert.equal(credentials.success, false);
  assert.match(JSON.stringify(credentials.error), /credentials are not allowed/);
});
