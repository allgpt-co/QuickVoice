ALTER TABLE "CallBillingSession" ADD COLUMN "livekitEstimatedMicros" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "CallBillingSession" ADD CONSTRAINT "CallBillingSession_livekit_nonnegative" CHECK ("livekitEstimatedMicros" >= 0);

CREATE TABLE "BillingRateCatalog" (
  "version" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "contentHash" TEXT NOT NULL,
  "settings" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingRateCatalog_pkey" PRIMARY KEY ("version"),
  CONSTRAINT "BillingRateCatalog_valid_window" CHECK ("expiresAt" > "effectiveAt")
);
CREATE UNIQUE INDEX "BillingRateCatalog_effectiveAt_key" ON "BillingRateCatalog"("effectiveAt");

CREATE TABLE "TelephonyRate" (
  "catalogVersion" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "originPrefix" TEXT NOT NULL,
  "destinationPrefix" TEXT NOT NULL,
  "rate" JSONB NOT NULL,
  CONSTRAINT "TelephonyRate_pkey" PRIMARY KEY ("catalogVersion", "provider", "direction", "destinationPrefix", "originPrefix"),
  CONSTRAINT "TelephonyRate_catalogVersion_fkey" FOREIGN KEY ("catalogVersion") REFERENCES "BillingRateCatalog"("version") ON DELETE RESTRICT ON UPDATE CASCADE
);
