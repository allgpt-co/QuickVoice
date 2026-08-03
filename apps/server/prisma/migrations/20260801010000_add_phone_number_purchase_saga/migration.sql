-- Persist phone-number purchase progress before any external side effect. The
-- row also acts as a durable quote-nonce consumption record after a number is
-- released, preventing an old signed quote from buying or debiting twice.

CREATE TYPE "PhoneNumberPurchaseStatus" AS ENUM (
  'PENDING',
  'RESERVED',
  'PROVIDER_PENDING',
  'PROVIDER_PURCHASED',
  'NUMBER_PERSISTED',
  'SUCCEEDED',
  'FAILED',
  'REQUIRES_ATTENTION'
);

CREATE TABLE "PhoneNumberPurchase" (
  "phoneNumberPurchaseId" TEXT NOT NULL,
  "quoteNonce" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "phoneNumber" TEXT NOT NULL,
  "provider" "TelephonyProvider" NOT NULL,
  "providerMonthlyCostMicros" BIGINT NOT NULL,
  "rentalPriceMicros" BIGINT NOT NULL,
  "billingCountryIso" TEXT NOT NULL,
  "billingNumberType" TEXT NOT NULL,
  "rateCatalogVersion" TEXT NOT NULL,
  "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
  "status" "PhoneNumberPurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "billingReservationId" TEXT,
  "providerResourceId" TEXT,
  "providerOrderId" TEXT,
  "providerFriendlyName" TEXT,
  "persistedPhoneNumberId" TEXT NOT NULL,
  "providerAttemptedAt" TIMESTAMP(3),
  "providerPurchasedAt" TIMESTAMP(3),
  "phonePersistedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "processingToken" TEXT,
  "processingExpiresAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhoneNumberPurchase_pkey" PRIMARY KEY ("phoneNumberPurchaseId"),
  CONSTRAINT "PhoneNumberPurchase_non_negative_amounts" CHECK (
    "providerMonthlyCostMicros" >= 0 AND "rentalPriceMicros" > 0
  ),
  CONSTRAINT "PhoneNumberPurchase_positive_attempts" CHECK ("attemptCount" >= 0)
);

CREATE UNIQUE INDEX "PhoneNumberPurchase_quoteNonce_key"
  ON "PhoneNumberPurchase"("quoteNonce");
CREATE UNIQUE INDEX "PhoneNumberPurchase_billingReservationId_key"
  ON "PhoneNumberPurchase"("billingReservationId");
CREATE UNIQUE INDEX "PhoneNumberPurchase_persistedPhoneNumberId_key"
  ON "PhoneNumberPurchase"("persistedPhoneNumberId");
CREATE INDEX "PhoneNumberPurchase_organizationId_createdAt_idx"
  ON "PhoneNumberPurchase"("organizationId", "createdAt");
CREATE INDEX "PhoneNumberPurchase_phoneNumber_status_idx"
  ON "PhoneNumberPurchase"("phoneNumber", "status");
CREATE INDEX "PhoneNumberPurchase_status_processingExpiresAt_idx"
  ON "PhoneNumberPurchase"("status", "processingExpiresAt");
CREATE INDEX "PhoneNumberPurchase_providerResourceId_idx"
  ON "PhoneNumberPurchase"("providerResourceId");
CREATE INDEX "PhoneNumberPurchase_providerOrderId_idx"
  ON "PhoneNumberPurchase"("providerOrderId");

-- PhoneNumber.number becomes the long-lived ownership guard after success.
-- Before that row exists, this partial index serializes all non-terminal sagas
-- for the same E.164 number, even when two different search quotes are used.
CREATE UNIQUE INDEX "PhoneNumberPurchase_one_active_phone_key"
  ON "PhoneNumberPurchase"("phoneNumber")
  WHERE "status" IN (
    'PENDING',
    'RESERVED',
    'PROVIDER_PENDING',
    'PROVIDER_PURCHASED',
    'NUMBER_PERSISTED',
    'REQUIRES_ATTENTION'
  );

ALTER TABLE "PhoneNumberPurchase"
  ADD CONSTRAINT "PhoneNumberPurchase_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
