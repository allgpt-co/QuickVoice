-- QuickVoice applies its Redis-backed authenticated limit after API-key
-- verification. Disable Better Auth's separate persisted quota, whose default
-- allowed only 10 verification requests per 24 hours and returned HTTP 401
-- when exhausted.
ALTER TABLE "Apikey"
  ALTER COLUMN "rateLimitEnabled" SET DEFAULT false,
  ALTER COLUMN "rateLimitTimeWindow" SET DEFAULT 60000,
  ALTER COLUMN "rateLimitMax" SET DEFAULT 300;

UPDATE "Apikey"
SET "rateLimitEnabled" = false,
    "rateLimitTimeWindow" = 60000,
    "rateLimitMax" = 300,
    "requestCount" = 0,
    "remaining" = NULL,
    "lastRequest" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;
