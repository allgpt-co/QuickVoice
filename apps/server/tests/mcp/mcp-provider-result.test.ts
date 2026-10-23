import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectMcpResult, withoutMcpAuthorizationLinks } from "../../src/modules/mcp/mcp-provider-result.js";

const url = "https://accounts.google.com/o/oauth2/v2/auth?state=private-state&scope=calendar.readonly";

test("recognizes structured, JSON-text and plain-text OAuth challenges in HTTP 200", () => {
  for (const body of [
    { authorizationRequired: true, authorizationUrl: url },
    { authorization: { status: "pending", url }, message: "Authorization required" },
    { content: [{ type: "text", text: JSON.stringify({ authorization_required: true, authorization_url: url, status: "authorization_required" }) }] },
    { content: [{ type: "text", text: `This tool requires authorization. Open this URL: ${url}` }] },
  ]) {
    const error = inspectMcpResult(body);
    assert.equal(error?.code, "MCP_AUTH_REQUIRED");
    assert.equal(error?.statusCode, 409);
    assert.equal(error?.authorizationUrl, url);
    assert.ok(!JSON.stringify(error?.details).includes("private-state"));
    assert.ok(!error?.message.includes(url));
  }
});

test("rejects unsafe authorization links and ignores URLs in ordinary tool data", () => {
  for (const authorizationUrl of ["javascript:alert(1)", "http://accounts.google.com/o/oauth2/auth", "https://accounts.google.com.attacker.test/auth", "https://evil.test/auth", "https://user:password@accounts.google.com/o/oauth2/auth"]) {
    assert.equal(inspectMcpResult({ authorizationRequired: true, authorizationUrl })?.authorizationUrl, null);
  }
  assert.equal(inspectMcpResult({ url, status: "pending" }), null);
  assert.equal(inspectMcpResult({ calendars: [{ description: "authorization required", url }] }), null);
  assert.equal(inspectMcpResult({ content: [{ text: JSON.stringify({ calendars: [{ description: `authorization required ${url}` }] }) }] }), null);
});

test("HTTP and MCP semantic failures cannot be recorded as successful tool results", () => {
  assert.equal(inspectMcpResult({ error: "upstream_error" }, 502)?.statusCode, 502);
  assert.equal(inspectMcpResult({ isError: true, content: [] })?.code, "MCP_TOOL_ERROR");
  assert.equal(inspectMcpResult({ calendars: [] }), null);
});

test("successful completed-auth metadata does not leak OAuth state into results or logs", () => {
  const result = { authorization: { status: "completed", url }, calendars: [{ id: "primary", date: "2026-10-23" }] };
  assert.equal(inspectMcpResult(result), null);
  assert.deepEqual((withoutMcpAuthorizationLinks(result) as any).calendars, result.calendars);
  assert.ok(!JSON.stringify(withoutMcpAuthorizationLinks(result)).includes("private-state"));
});
