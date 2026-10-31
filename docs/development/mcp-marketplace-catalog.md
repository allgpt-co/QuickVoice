# Composio integrations

QuickVoice uses Composio REST API v3.1 for marketplace discovery, account authorization, tool schemas, and execution. The existing `/mcp` API routes and agent tool bridge remain compatible. Native Composio integrations are toolkits; custom remote MCP servers are registered as experimental custom toolkits.

## Server setup

1. Create a Composio project dedicated to this QuickVoice environment. Use separate projects/keys for staging and production.
2. Create a project API key with access to toolkit discovery, connected accounts (including linking and deletion), session management, and session tool execution. Custom MCP also needs custom-toolkit management access. Store it as `COMPOSIO_API_KEY` on the **API server**, never in a browser variable or agent prompt.
3. Managed authentication is the default. To use your own OAuth applications, create the toolkit auth configurations in Composio and set `COMPOSIO_AUTH_CONFIGS` to a JSON object, for example `{"googlecalendar":"ac_your_config_id"}`. Enable those auth configurations for Tool Router/session use. Grant the scopes needed for the tools you intend to use.
4. Apply the normal Prisma deployment migrations before starting the new server (`pnpm --filter server exec prisma migrate deploy` in a source checkout). Deploy matching API and console images. If `READINESS_REQUIRED_INTEGRATIONS` previously included `smithery`, replace it with `composio`.
5. In QuickVoice, open **Tools → MCP marketplace**, search for the app, select **Connect**, then **Setup**, and authorize the intended business account. The browser polls for completion; **Refresh** checks it again. A missing API key or provider outage displays an error with Retry, never a fake four-app fallback.
6. In **Connected MCPs**, use **Test access** on a read-only tool with valid inputs. Attach the connected integration to the desired agents, then start a fresh preview or call.

Do not turn on Composio's optional project callback identity verifier until QuickVoice has a compatible verifier endpoint. This implementation uses hosted Connect Links and server-side account ownership checks; it does not implement that optional callback protocol. Return to QuickVoice after Composio shows successful authorization.

## Existing Smithery accounts

OAuth grants and tool names do not transfer between providers. The migration retains old rows, attachments, and logs for reference but marks Smithery connections disconnected and clears their executable tools and setup links. Legacy entries explain how to reconnect.

Authorize the corresponding app through the Composio marketplace, test it, and attach the **new** connection to each intended agent. Update any prompts that hard-code Smithery/Arcade tool names or argument names: Composio has its own schemas. Remove the legacy entries after switching agents. If Smithery is unavailable, local removal succeeds; revoke the old authorization in the connected app's account settings. An optional existing `SMITHERY_API_KEY` is used only for best-effort retirement of old grants, never for new setup or execution.

The Smithery import CLI is retired. The marketplace reads the current native Composio catalog, paginates fully, and caches it for five minutes. No manual catalog import is needed. Native listings are provider-managed entries, not a promise that every operation is authorized or tested. Catalog presence alone does not implement or verify every item in an integration planning spreadsheet.

## Account and tool behavior

- A stable provider principal belongs to one organization connection. All attached agents/calls reuse that principal and its explicit connected-account ID. Caller IDs and call IDs never become Composio auth identities.
- Account selection is pinned in the session and execution request. Sessions enable only that connection's toolkit. Provider connection-management helpers, sandbox/workbench, proxy execution, search helpers, and instant paid tools are disabled.
- OAuth/API credentials stay in Composio. QuickVoice saves only connection/session identifiers, normalized schemas, status, and redacted execution previews. Account API responses are not returned or logged.
- Only read-only tools are autonomous, consistent with the existing QuickVoice policy. Create/update/delete/unknown tools still require a trusted user execution path. This migration does **not** make spoken approval sufficient to book events or send messages automatically.
- Tool arguments are validated against the synced provider schema before execution. No guessed remapping, coercion, or removal of unsupported inputs occurs. Refresh tools after provider schema changes.
- HTTP success with a provider failure/challenge is still failure. Callers receive an administrator-setup message rather than an OAuth URL. Reconnect in the marketplace after revocation/expiry or a new permission requirement; ordinary calls do not initiate consent.
- Setup is serialized by a database lease across replicas. Repeated Connect clicks reuse the saved account. A remote account whose ID failed to save is recovered by its dedicated principal. Leases expire after five minutes if a process dies.
- Ordinary refresh reuses the runtime session so it does not invalidate active calls. A missing or deleted session can be replaced during refresh, keeping the authorized account. A missing session/tool during execution marks the connection as needing refresh; a late failure cannot overwrite a newer connection state. Failed execution is never automatically replayed, because that could duplicate a provider write.
- Temporary setup errors preserve the existing consent link. If a pending account has lost its link, Reconnect creates a replacement authorization flow using the same saved principal.
- Disconnect removes the remote account/session before deleting local records and attachments. Failed Composio cleanup leaves the local handle available for retry. Provider revocation may be asynchronous; deleting a connection is not proof that an issuer has invalidated every token.

## Custom MCP servers

Select the authentication method documented by the server:

- **OAuth:** supports dynamic client registration (DCR). Supply its public HTTPS authorization-server discovery document, not the protected-resource metadata URL. CIMD-only servers are not supported by Composio's experimental custom-MCP OAuth path.
- **API key:** the current form supports an `Authorization: Bearer` token. Enter the token on Composio's hosted setup page. Arbitrary custom credential headers are not exposed by this form.
- **No authentication:** only for servers that actually accept unauthenticated requests.

The endpoint must be public HTTPS, directly served without redirects, and contain no credentials. Toolkits are named using a digest of the organization and endpoint/auth configuration. They are never listed in another organization's marketplace; user-supplied `CUSTOM_*` catalog slugs are rejected. Custom sync uses the selected account. Composio currently limits a custom toolkit to 500 tools and labels the lifecycle API experimental.

## Deployment acceptance test

Use a staging Composio project and a non-production Calendar account first:

1. Connect Calendar in organization A; finish consent. Refresh must show Connected and actual tools.
2. Test a calendar-list tool using its displayed schema. Confirm the intended account and results.
3. Attach to two agents. End preview, start a new preview, and repeat: both use the same account with no consent request to the caller.
4. Check organization B cannot list, attach, or execute A's saved connection.
5. Revoke Calendar access at Google; the next failure must be reported without a spoken OAuth link. Reconnect through the admin console and repeat.
6. Supply an invalid parameter: execution must return `MCP_ARGUMENTS_INVALID` before a provider call. A write tool must remain blocked for autonomous execution.
7. Reject/dismiss OAuth, expire a link, and retry. If the provider still presents an expired pending link, disconnect that pending connection and connect again.
8. Disconnect: remove the agent attachment and confirm subsequent calls cannot use the old handle.

Local automated checks mock Composio responses. They do not establish live OAuth compatibility, provider availability, or account scopes. Live acceptance requires the configured project and actual consent.

Official contracts: [sessions](https://docs.composio.dev/reference/api-reference/tool-router), [connected accounts](https://docs.composio.dev/reference/api-reference/connected-accounts), [custom MCP](https://docs.composio.dev/docs/extending-sessions/custom-mcp).
