ALTER TABLE "McpConnection"
  ALTER COLUMN "smitheryNamespace" DROP NOT NULL,
  ALTER COLUMN "smitheryConnectionId" DROP NOT NULL,
  ADD COLUMN "connectionKey" TEXT,
  ADD COLUMN "toolkitSlug" TEXT,
  ADD COLUMN "providerUserId" TEXT,
  ADD COLUMN "providerAccountId" TEXT,
  ADD COLUMN "providerSessionId" TEXT,
  ADD COLUMN "setupLeaseUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX "McpConnection_organizationId_provider_connectionKey_key"
  ON "McpConnection"("organizationId", "provider", "connectionKey");
-- Keep history and attachments, but never execute an old grant as Composio.
UPDATE "McpConnection" SET "status" = 'DISCONNECTED', "setupUrl" = NULL,
  "tools" = '[]'::jsonb,
  "metadata" = COALESCE("metadata", '{}'::jsonb) ||
    '{"migrationRequired":true,"lastSyncError":"Reconnect this integration through Composio in the marketplace, then attach the new connection to your agents."}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "provider" = 'smithery';
