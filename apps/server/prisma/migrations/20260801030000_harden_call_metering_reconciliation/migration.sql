-- Make call charging and asynchronous provider reconciliation restart-safe.

CREATE TYPE "CallBillingMode" AS ENUM ('WALLET', 'LEGACY_SUBSCRIPTION');

ALTER TABLE "CallBillingSession"
  ADD COLUMN "billingMode" "CallBillingMode" NOT NULL DEFAULT 'WALLET',
  ADD COLUMN "unreportedTailMicros" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "CallBillingSession"
  ADD CONSTRAINT "CallBillingSession_non_negative_unreported_tail"
  CHECK ("unreportedTailMicros" >= 0);

-- One provider charge must never be applied to two wallet calls. PostgreSQL
-- permits multiple NULL values in a unique index, so non-telephony sessions
-- and sessions awaiting correlation remain valid.
DROP INDEX IF EXISTS "CallBillingSession_providerCallId_idx";
CREATE UNIQUE INDEX "CallBillingSession_telephonyProvider_providerCallId_key"
  ON "CallBillingSession"("telephonyProvider", "providerCallId");

-- Telnyx CDR generation is an external side effect. A durable lease prevents
-- overlapping cron workers from creating or processing the same report while
-- allowing another worker to recover after a crash.
ALTER TABLE "TelephonyCostReport"
  ADD COLUMN "processingToken" TEXT,
  ADD COLUMN "processingExpiresAt" TIMESTAMP(3);

CREATE INDEX "TelephonyCostReport_processingExpiresAt_idx"
  ON "TelephonyCostReport"("processingExpiresAt");
