# Populate the MCP marketplace catalog

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
