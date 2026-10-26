# Populate the MCP marketplace catalog

> **Provider shutdown:** [Smithery's October 2026 announcement](https://smithery.ai/future) says its Connect/API, managed OAuth, API keys, and hosted `server.smithery.ai` / `run.tools` endpoints shut down on **October 31, 2026**. The public registry remains available. QuickVoice's existing Smithery transport requires migration to a supported connection provider or direct MCP transport before that shutdown. Schema validation does not replace that transport or transfer OAuth grants. Choose the replacement and reauthorize the intended organization accounts; do not treat a registry listing as a working connection.

The API shows four built-in MCP servers when the shared `McpServerCatalogItem` table has no Smithery rows. Agent **Add MCP** shows only connections already made by the organization; it is not the marketplace catalog.

After deploying a server image that contains `dist/src/modules/mcp/import-smithery-catalog.cli.js`:

1. Confirm the API server has `SMITHERY_API_KEY` and `DATABASE_URL` configured. Do not print either value or pass the key on a command line.
2. Open the production QuickVoice server container's terminal in Coolify and run:

   ```sh
   cd /app/apps/server
   test -n "$SMITHERY_API_KEY" && test -n "$DATABASE_URL"
   node dist/src/modules/mcp/import-smithery-catalog.cli.js
   ```

   The command fetches deployed remote servers from Smithery and upserts them into the shared database. It can take several minutes. If it fails part-way, fix the reported error and rerun it; existing entries are updated by URL.
3. In the production database, confirm rows were imported:

   ```sql
   SELECT count(*)
   FROM "McpServerCatalogItem"
   WHERE "organizationId" IS NULL AND "source" = 'SMITHERY';
   ```

4. Reload **Tools marketplace → MCP marketplace**. Search for a provider, connect it, complete authorization, then check **Connected MCPs** for `CONNECTED` and synced tools before attaching it to an agent.

Importing Smithery listings does not implement every item in the integration planning spreadsheet. A provider absent from Smithery needs a working remote MCP endpoint for **Connect a custom MCP server**, or an HTTP tool/integration built for that provider. Only attach trusted servers and review the tools and permissions granted during authorization.

## Authorize and verify an organization's provider account

`SERVER CONNECTED` confirms MCP server connectivity, not Google Calendar or other tool-level authorization. Complete account setup in **Tools marketplace → Connected MCPs → Test access** before deploying an agent:

1. Choose an explicitly read-only tool, such as `GoogleCalendar_WhoAmI` or `GoogleCalendar_ListCalendars`. Use the displayed input schema for required arguments; use `{}` when no inputs are required.
2. Run the read-only test. If the provider requests authorization, select **Authorize account**, sign in as the intended organization calendar owner, and review the permissions requested by the provider.
3. Return to QuickVoice and run the same test again. Browser or verbal confirmation alone does not mark a tool verified. Verify each tool the agent needs: one tool's Google grant may not cover another tool's scopes.
4. Attach this saved connection to the intended agents. End the preview, start a new preview, and repeat the same read operation to verify consent survives a new call. Calls reuse the persisted Smithery namespace and connection ID; they do not create a new provider connection per caller.

Account setup tests require an authenticated console session with `tools:execute`. Organization API keys, internal callers, and read-only members cannot use that endpoint. Setup tests cannot execute destructive, unknown, or confirmation-required tools. Authorizing Google access does not bypass QuickVoice's separate restrictions on autonomous write tools.

When a tool returns an authorization challenge during a call, QuickVoice records the pending tool permission and gives the voice worker a safe administrator-setup error, without passing the OAuth URL to the LLM. The transient link is returned only to the authorized console test response; it is not stored in connection metadata or execution logs. Refreshing a tool list cannot clear pending authorization. Upstream HTTP failures and MCP `isError` responses are failures, including when the provider returns HTTP 200.

Deploy the API server, AI worker, and console together for this change. No new environment variables or database migrations are needed. Google consent must still be completed by the account owner; QuickVoice cannot grant it automatically. If consent is revoked or a new permission is requested, repeat the console setup test for that tool. Actual Google authorization and cross-call token persistence must be verified against the deployed provider.

UI verification screenshots use the actual console components with a local mock Calendar provider; no Google account was accessed: [desktop](images/mcp-provider-authorization-desktop.png), [mobile](images/mcp-provider-authorization-mobile.png).

## Tool contracts and calendar dates

The voice agent lists allowed tool names, then uses `get_mcp_tool_schema` to read a selected tool's complete stored `inputSchema` and description before constructing arguments. This works across MCP providers; Calendar argument names are not hardcoded. Schemas and descriptions are reference data, not system instructions.

The API independently validates every execution, including console **Test access**, against that tool's synced JSON Schema before contacting the provider. Validation supports draft 7, 2019-09, and 2020-12, nested objects, local references, enums, alternatives, and standard formats. It does not coerce types, insert defaults, remove unknown fields, or fetch external schema URLs. Invalid arguments return `422 MCP_ARGUMENTS_INVALID` with the schema and bounded validation issues so the model can correct its request. Missing, unsupported, oversized, or excessively expensive schemas return `409 MCP_SCHEMA_UNAVAILABLE`; refresh the connection and investigate the provider schema. Authorization and confirmation checks still run first. Schemas are limited to 64 KB, argument objects to 8 KB, and the process keeps at most 64 compiled validators with compilation/validation time limits.

For example, the reported `GoogleCalendar_FindTimeSlotsWhenEveryoneIsFree` schema accepts these arguments:

```json
{
  "start_date": "2026-10-27",
  "end_date": "2026-10-27",
  "start_time_boundary": "00:00",
  "end_time_boundary": "23:59"
}
```

That particular tool does **not** accept `start_time`, `end_time`, `calendar_ids`, `duration_minutes`, or `timezone`. Its documented defaults select the current account when `email_addresses` is omitted. A request for 30-minute availability must be derived from the returned free intervals. Check the provider's timezone and date-boundary semantics rather than inventing extra fields or promising exact midnight coverage. Other tools can have different contracts; inspect each one.

Each call receives the current date/time in the agent's saved IANA timezone, with UTC as the fallback. `get_current_time` refreshes it during long calls or for a caller-requested timezone. Relative dates use that clock, and future event searches start now unless the caller specifies otherwise. Provider results must still be converted to the caller's requested timezone when necessary.

Deploy the **API server and AI worker** together for contract validation and clock context. There are no new environment variables or database migrations. Refresh older connections, complete **Test access** for each needed read-only operation, then start a new preview. Confirm an intentionally unsupported argument produces a validation error without a provider request, correct it using the displayed schema, and verify the read succeeds in both a new preview and a phone call. This local regression suite uses mocked providers and does not establish live OAuth persistence or availability. Write tools still require a separate trusted confirmation flow.
