-- Before this release API keys were user-scoped by the Better Auth plugin and
-- QuickVoice trusted client-editable metadata to select an organization. Those
-- rows cannot be migrated safely because their metadata is not authoritative.
-- Revoke them all; administrators must issue new organization-scoped keys.
UPDATE "Apikey"
SET "enabled" = false,
    "metadata" = NULL,
    "permissions" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "enabled" IS DISTINCT FROM false
   OR "metadata" IS NOT NULL
   OR "permissions" IS NOT NULL;
