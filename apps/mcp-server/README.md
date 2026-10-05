# QuickVoice MCP Server

Remote MCP server exposing verified QuickVoice organization APIs as MCP tools/resources over Streamable HTTP.

## SDK choice

This app uses the official TypeScript SDK `@modelcontextprotocol/sdk` because QuickVoice is a Node/TypeScript monorepo for the main API server, and the SDK provides first-class Streamable HTTP transport support.

## Authentication

The MCP endpoint is remote and is not public. Clients must authenticate every request with a QuickVoice API key:

```http
x-api-key: qv_...
```

or:

```http
Authorization: Bearer qv_...
```

The MCP server forwards that API key to the existing QuickVoice API, so existing organization permissions continue to apply. No business logic is duplicated in the MCP server.

API keys are validated before an MCP session is allocated. Sessions are bound
to the key that created them, expire after 15 minutes idle or 24 hours total,
and default to limits of 1,000 globally, 10 per API key, and 20 concurrent
initializations. Override these limits with `MCP_MAX_SESSIONS`,
`MCP_MAX_SESSIONS_PER_KEY`, `MCP_MAX_PENDING_INITIALIZATIONS`,
`MCP_SESSION_IDLE_TTL_MS`, and `MCP_SESSION_ABSOLUTE_TTL_MS`.

Tool and resource API calls have a 30-second deadline covering both the request
and response-body reading. MCP request cancellation also aborts the upstream
fetch. Initialization key validation retains its 5-second deadline. Timeout and
cancellation errors use safe messages; requests are not automatically retried.
A timeout does not undo a mutation already accepted by the API. Check its result
before retrying a create, delete, payment, or outbound-call action.

Connected remote tool execution requires `tools:execute`. Organization API keys
retain their read-only scope allowlist and cannot execute these tools, including
through `execute_connected_mcp_tool` (the API returns `403`). Listing connections
and tools still uses `tools:read`. Owner/admin browser sessions and trusted
internal AI workers can execute tools through the API. Deploy the API server to
enforce this check; no database migration or credential change is required.

## Run locally

```bash
pnpm --filter quickvoice-mcp-server build
PORT=8787 \
QUICKVOICE_API_BASE_URL=http://localhost:5000/api/v1 \
pnpm --filter quickvoice-mcp-server start
```

## Required env vars

| Env var | Required | Description |
|---|---:|---|
| `QUICKVOICE_API_BASE_URL` | Yes | Base URL of the existing QuickVoice API, e.g. `https://api.quickvoice.co/api/v1`. |
| `PORT` or `MCP_PORT` | No | HTTP port. Default `8787`. |
| `MCP_ENDPOINT_PATH` | No | MCP path. Default `/mcp`. |
| `MCP_CORS_ORIGINS` | No | Comma-separated browser client origins allowed to call the MCP endpoint. |

## Client connection

Configure an MCP Streamable HTTP client with:

```json
{
  "name": "quickvoice",
  "url": "https://YOUR_MCP_HOST/mcp",
  "headers": {
    "x-api-key": "YOUR_QUICKVOICE_API_KEY"
  }
}
```

The server exposes:

- `quickvoice://api_catalog` resource with the full API inventory.
- One MCP resource template per read-only verified API.
- One MCP tool per mutation/action verified API.

The optional standalone `GET /mcp` SSE stream returns `405 Method Not Allowed`
immediately for requests with an API key. This server has no unsolicited server
notifications; clients continue using Streamable HTTP POST requests, including
SSE responses to those requests. This avoids an idle background stream timing
out behind proxies such as Cloudflare. A `405` from this GET probe is expected.

## Transport regression test

```bash
pnpm --filter quickvoice-mcp-server test:transport
```

This starts a local server on an available port and checks the API-key requirement,
SDK client initialization, the optional GET response, tool discovery, catalog
reads, session ownership/termination, sanitized errors, upstream deadlines, and
cancellation. Tool calls use mocked API responses and local stalled HTTP servers;
the test needs no real API key and does not contact production services.

## Smoke test

Start the MCP server, then run:

```bash
QUICKVOICE_API_KEY=qv_... \
MCP_URL=http://localhost:8787/mcp \
pnpm --filter quickvoice-mcp-server test:mcp
```

For resource templates that require IDs, optionally provide:

```bash
MCP_TEST_AGENT_ID=...
MCP_TEST_CALL_ID=...
MCP_TEST_WIDGET_ID=...
```

Mutation tools are listed but not executed by the smoke test to avoid destructive side effects.

Initialization is limited to 20 attempts per minute per resolved client address and
bounded session capacity before an upstream key check. Failed key checks are cached
for 60 seconds, successful checks for 15 seconds; tool execution still checks the key
on every upstream request. Set `MCP_TRUSTED_PROXY_CIDRS` to the actual Traefik proxy
IPs/CIDRs when behind Coolify. Default is no proxy trust; never use a blanket range.
Caches and initialization limits are process-local; multiple replicas require a shared
limiter at the ingress to enforce one aggregate budget.
