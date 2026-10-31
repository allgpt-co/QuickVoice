import assert from "node:assert/strict";
import { test } from "node:test";

import { connectMcpSchema } from "../../src/modules/mcp/mcp.schema.js";

test("malformed custom MCP URLs produce validation issues instead of throwing", () => {
  for (const customUrl of ["not-a-valid-url", "/relative/path", "https://", "", "   "]) {
    const result = connectMcpSchema.safeParse({ customUrl });
    assert.equal(result.success, false);
    assert.ok(result.error?.issues.some((issue) =>
      issue.path.join(".") === "customUrl" && issue.message === "Invalid URL"
    ));
  }
});

test("MCP connection still requires exactly one catalog slug or custom URL", () => {
  assert.equal(connectMcpSchema.safeParse({ catalogSlug: "example" }).success, true);
  assert.equal(connectMcpSchema.safeParse({}).success, false);
  assert.equal(connectMcpSchema.safeParse({
    catalogSlug: "example",
    customUrl: "https://server.example.com/mcp",
  }).success, false);
});

test("custom MCP connection accepts HTTPS MCP and legacy SSE endpoints", () => {
  assert.equal(
    connectMcpSchema.safeParse({
      customUrl: "https://server.example.com/mcp",
      authMode: "none",
      displayName: "Internal tools",
    }).success,
    true,
  );
  assert.equal(
    connectMcpSchema.safeParse({
      customUrl: "https://demo-day.mcp.cloudflare.com/sse",
      authMode: "api_key",
    }).success,
    true,
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
  assert.match(
    JSON.stringify(credentials.error),
    /credentials are not allowed/,
  );
});

test("custom OAuth requires an HTTPS discovery URL and explicit authentication mode", () => {
  assert.equal(
    connectMcpSchema.safeParse({ customUrl: "https://example.com/mcp" })
      .success,
    false,
  );
  assert.equal(
    connectMcpSchema.safeParse({
      customUrl: "https://example.com/mcp",
      authMode: "oauth",
    }).success,
    false,
  );
  assert.equal(
    connectMcpSchema.safeParse({
      customUrl: "https://example.com/mcp",
      authMode: "oauth",
      discoveryUrl:
        "https://auth.example.com/.well-known/oauth-authorization-server",
    }).success,
    true,
  );
});
