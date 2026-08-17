-- Replace plan-minute entitlements with an organization-level prepaid wallet.

CREATE TYPE "BillingTransactionType" AS ENUM (
  'PROMOTIONAL_GRANT',
  'TOP_UP',
  'CALL_RESERVATION',
  'CALL_SETTLEMENT',
  'RESERVATION_RELEASE',
  'NUMBER_PURCHASE',
  'NUMBER_RENEWAL',
  'REFUND',
  'DISPUTE',
  'ADJUSTMENT',
  'DEBT_INCURRED',
  'DEBT_REPAYMENT'
);

CREATE TYPE "BillingReservationPurpose" AS ENUM (
  'CALL_USAGE',
  'PHONE_NUMBER_PURCHASE',
  'PHONE_NUMBER_RENEWAL'
);

CREATE TYPE "BillingReservationStatus" AS ENUM ('ACTIVE', 'SETTLED', 'RELEASED');

CREATE TYPE "TopUpStatus" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED'
);

CREATE TYPE "TopUpKind" AS ENUM ('MANUAL', 'AUTOMATIC');

CREATE TYPE "TopUpTaxMode" AS ENUM ('DISABLED', 'STRIPE_TAX');

CREATE TYPE "CallBillingSessionStatus" AS ENUM (
  'AUTHORIZED',
  'ACTIVE',
  'ENDED',
  'RECONCILING',
  'SETTLED',
  'DEBT'
);

CREATE TYPE "StripeWebhookEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED'
);

CREATE TYPE "TelephonyCostReportStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETE',
  'FAILED',
  'EXPIRED'
);

CREATE TYPE "PhoneNumberBillingStatus" AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'RELEASE_PENDING',
  'RELEASED'
);

CREATE TABLE "BillingAccount" (
  "billingAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "paidBalanceMicros" BIGINT NOT NULL DEFAULT 0,
  "promotionalBalanceMicros" BIGINT NOT NULL DEFAULT 0,
  "reservedPaidMicros" BIGINT NOT NULL DEFAULT 0,
  "reservedPromotionalMicros" BIGINT NOT NULL DEFAULT 0,
  "debtMicros" BIGINT NOT NULL DEFAULT 0,
  "autoRechargeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "autoRechargeThresholdMicros" BIGINT NOT NULL DEFAULT 5000000,
  "autoRechargeAmountMicros" BIGINT NOT NULL DEFAULT 20000000,
  "stripePaymentMethodId" TEXT,
  "paymentMethodRequestVersion" INTEGER NOT NULL DEFAULT 0,
  "paymentMethodAppliedVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("billingAccountId"),
  CONSTRAINT "BillingAccount_non_negative_balances" CHECK (
    "paidBalanceMicros" >= 0 AND
    "promotionalBalanceMicros" >= 0 AND
    "reservedPaidMicros" >= 0 AND
    "reservedPromotionalMicros" >= 0 AND
    "debtMicros" >= 0
  ),
  CONSTRAINT "BillingAccount_auto_recharge_values" CHECK (
    "autoRechargeThresholdMicros" >= 0 AND
    "autoRechargeAmountMicros" > 0
  ),
  CONSTRAINT "BillingAccount_payment_method_versions" CHECK (
    "paymentMethodRequestVersion" >= 0 AND
    "paymentMethodAppliedVersion" >= 0 AND
    "paymentMethodAppliedVersion" <= "paymentMethodRequestVersion"
  )
);

CREATE TABLE "BillingTransaction" (
  "billingTransactionId" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "BillingTransactionType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "grossAmountMicros" BIGINT NOT NULL DEFAULT 0,
  "paidBalanceDeltaMicros" BIGINT NOT NULL DEFAULT 0,
  "promotionalBalanceDeltaMicros" BIGINT NOT NULL DEFAULT 0,
  "reservedPaidDeltaMicros" BIGINT NOT NULL DEFAULT 0,
  "reservedPromotionalDeltaMicros" BIGINT NOT NULL DEFAULT 0,
  "debtDeltaMicros" BIGINT NOT NULL DEFAULT 0,
  "paidBalanceAfterMicros" BIGINT NOT NULL,
  "promotionalBalanceAfterMicros" BIGINT NOT NULL,
  "reservedPaidAfterMicros" BIGINT NOT NULL,
  "reservedPromotionalAfterMicros" BIGINT NOT NULL,
  "debtAfterMicros" BIGINT NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("billingTransactionId"),
  CONSTRAINT "BillingTransaction_non_negative_amounts" CHECK (
    "grossAmountMicros" >= 0 AND
    "paidBalanceAfterMicros" >= 0 AND
    "promotionalBalanceAfterMicros" >= 0 AND
    "reservedPaidAfterMicros" >= 0 AND
    "reservedPromotionalAfterMicros" >= 0 AND
    "debtAfterMicros" >= 0
  )
);

COMMENT ON TABLE "BillingTransaction" IS
  'Append-only prepaid wallet ledger. Rows are never updated or deleted by billing application code.';

CREATE TABLE "BillingReservation" (
  "billingReservationId" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purpose" "BillingReservationPurpose" NOT NULL,
  "status" "BillingReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "idempotencyKey" TEXT NOT NULL,
  "amountMicros" BIGINT NOT NULL,
  "paidAmountMicros" BIGINT NOT NULL DEFAULT 0,
  "promotionalAmountMicros" BIGINT NOT NULL DEFAULT 0,
  "settledAmountMicros" BIGINT NOT NULL DEFAULT 0,
  "debtIncurredMicros" BIGINT NOT NULL DEFAULT 0,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingReservation_pkey" PRIMARY KEY ("billingReservationId"),
  CONSTRAINT "BillingReservation_non_negative_amounts" CHECK (
    "amountMicros" > 0 AND
    "paidAmountMicros" >= 0 AND
    "promotionalAmountMicros" >= 0 AND
    "settledAmountMicros" >= 0 AND
    "debtIncurredMicros" >= 0 AND
    "paidAmountMicros" + "promotionalAmountMicros" = "amountMicros"
  )
);

CREATE TABLE "PromotionalGrant" (
  "promotionalGrantId" TEXT NOT NULL,
  "userId" TEXT,
  "identityHash" TEXT NOT NULL,
  "organizationId" TEXT,
  "billingAccountId" TEXT,
  "amountMicros" BIGINT NOT NULL,
  "billingTransactionId" TEXT,
  "reason" TEXT NOT NULL DEFAULT 'signup',
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionalGrant_pkey" PRIMARY KEY ("promotionalGrantId"),
  CONSTRAINT "PromotionalGrant_positive_amount" CHECK ("amountMicros" > 0)
);

CREATE TABLE "TopUp" (
  "topUpId" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "kind" "TopUpKind" NOT NULL DEFAULT 'MANUAL',
  "automaticContextKey" TEXT,
  "processingToken" TEXT,
  "processingExpiresAt" TIMESTAMP(3),
  "reconciliationNextAt" TIMESTAMP(3),
  "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeTaxCalculationId" TEXT,
  "taxMode" "TopUpTaxMode" NOT NULL DEFAULT 'DISABLED',
  "stripeTaxCode" TEXT,
  "amountMicros" BIGINT NOT NULL,
  "taxMicros" BIGINT NOT NULL DEFAULT 0,
  "creditedMicros" BIGINT NOT NULL DEFAULT 0,
  "refundedMicros" BIGINT NOT NULL DEFAULT 0,
  "disputedMicros" BIGINT NOT NULL DEFAULT 0,
  "refundTargetProviderCents" BIGINT NOT NULL DEFAULT 0,
  "disputeTargetProviderCents" BIGINT NOT NULL DEFAULT 0,
  "stripeDisputeId" TEXT,
  "disputeState" TEXT NOT NULL DEFAULT 'NONE',
  "financialProcessingToken" TEXT,
  "financialProcessingExpiresAt" TIMESTAMP(3),
  "financialReconciliationPending" BOOLEAN NOT NULL DEFAULT false,
  "status" "TopUpStatus" NOT NULL DEFAULT 'PENDING',
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "TopUp_pkey" PRIMARY KEY ("topUpId"),
  CONSTRAINT "TopUp_non_negative_amounts" CHECK (
    "amountMicros" > 0 AND
    "taxMicros" >= 0 AND
    "creditedMicros" >= 0 AND
    "refundedMicros" >= 0 AND
    "disputedMicros" >= 0 AND
    "refundTargetProviderCents" >= 0 AND
    "disputeTargetProviderCents" >= 0 AND
    "reconciliationAttempts" >= 0 AND
    "refundedMicros" + "disputedMicros" <= "creditedMicros"
  ),
  CONSTRAINT "TopUp_dispute_state" CHECK (
    "disputeState" IN ('NONE', 'OPEN', 'WON', 'LOST')
  ),
  CONSTRAINT "TopUp_tax_snapshot" CHECK (
    ("taxMode" = 'DISABLED' AND "stripeTaxCode" IS NULL AND "taxMicros" = 0) OR
    ("taxMode" = 'STRIPE_TAX' AND "stripeTaxCode" IS NOT NULL)
  )
);

CREATE TABLE "CallBillingSession" (
  "callBillingSessionId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" "CallBillingSessionStatus" NOT NULL DEFAULT 'AUTHORIZED',
  "admissionGeneration" INTEGER NOT NULL DEFAULT 1,
  "rateCatalogVersion" TEXT NOT NULL,
  "rateSnapshot" JSONB NOT NULL,
  "lastModelUsage" JSONB,
  "activeReservationId" TEXT,
  "sessionId" TEXT,
  "roomName" TEXT,
  "agentId" TEXT,
  "userId" TEXT,
  "lastUsageSequence" INTEGER NOT NULL DEFAULT 0,
  "processingUsageSequence" INTEGER,
  "processingUsageStartedAt" TIMESTAMP(3),
  "connectedSeconds" INTEGER NOT NULL DEFAULT 0,
  "connectedMilliseconds" BIGINT NOT NULL DEFAULT 0,
  "aiCostMicros" BIGINT NOT NULL DEFAULT 0,
  "platformCostMicros" BIGINT NOT NULL DEFAULT 0,
  "telephonyEstimatedMicros" BIGINT NOT NULL DEFAULT 0,
  "telephonyFinalMicros" BIGINT,
  "totalSettledMicros" BIGINT NOT NULL DEFAULT 0,
  "debtIncurredMicros" BIGINT NOT NULL DEFAULT 0,
  "telephonyProvider" "TelephonyProvider",
  "providerCallId" TEXT,
  "providerBillableSeconds" INTEGER,
  "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
  "reconciliationClaimedAt" TIMESTAMP(3),
  "reconciliationNextAt" TIMESTAMP(3),
  "reconciliationLastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CallBillingSession_pkey" PRIMARY KEY ("callBillingSessionId"),
  CONSTRAINT "CallBillingSession_non_negative_usage" CHECK (
    "lastUsageSequence" >= 0 AND
    "admissionGeneration" > 0 AND
    ("processingUsageSequence" IS NULL OR "processingUsageSequence" >= 0) AND
    "connectedSeconds" >= 0 AND
    "connectedMilliseconds" >= 0 AND
    "aiCostMicros" >= 0 AND
    "platformCostMicros" >= 0 AND
    "telephonyEstimatedMicros" >= 0 AND
    ("telephonyFinalMicros" IS NULL OR "telephonyFinalMicros" >= 0) AND
    ("providerBillableSeconds" IS NULL OR "providerBillableSeconds" >= 0) AND
    "reconciliationAttempts" >= 0 AND
    "totalSettledMicros" >= 0 AND
    "debtIncurredMicros" >= 0
  )
);

CREATE TABLE "TelephonyCostReport" (
  "telephonyCostReportId" TEXT NOT NULL,
  "provider" "TelephonyProvider" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "externalReportId" TEXT,
  "status" "TelephonyCostReportStatus" NOT NULL DEFAULT 'PENDING',
  "reportUrl" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelephonyCostReport_pkey" PRIMARY KEY ("telephonyCostReportId"),
  CONSTRAINT "TelephonyCostReport_valid_period" CHECK ("periodEnd" > "periodStart")
);

CREATE TABLE "StripeWebhookEvent" (
  "stripeEventId" TEXT NOT NULL,
  "organizationId" TEXT,
  "type" TEXT NOT NULL,
  "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "livemode" BOOLEAN NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("stripeEventId"),
  CONSTRAINT "StripeWebhookEvent_non_negative_attempts" CHECK ("attempts" >= 0)
);

ALTER TABLE "PhoneNumber"
  ADD COLUMN "billingStatus" "PhoneNumberBillingStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "providerMonthlyCostMicros" BIGINT,
  ADD COLUMN "rentalPriceMicros" BIGINT,
  ADD COLUMN "nextBillingAt" TIMESTAMP(3),
  ADD COLUMN "lastBilledAt" TIMESTAMP(3),
  ADD COLUMN "billingSuspendedAt" TIMESTAMP(3),
  ADD COLUMN "scheduledReleaseAt" TIMESTAMP(3),
  ADD COLUMN "billingFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastBillingAttemptAt" TIMESTAMP(3),
  ADD COLUMN "billingNoticeSentAt" TIMESTAMP(3),
  ADD COLUMN "billingSuspendedAgentId" TEXT,
  ADD COLUMN "billingCountryIso" TEXT,
  ADD COLUMN "billingNumberType" TEXT,
  ADD COLUMN "billingRateCatalogVersion" TEXT,
  ADD CONSTRAINT "PhoneNumber_non_negative_billing" CHECK (
    ("providerMonthlyCostMicros" IS NULL OR "providerMonthlyCostMicros" >= 0) AND
    ("rentalPriceMicros" IS NULL OR "rentalPriceMicros" >= 0) AND
    "billingFailureCount" >= 0
  );

-- Existing rentals enter prepaid billing after the promised seven-day notice.
-- Their provider cost and customer price are resolved by the renewal worker at
-- charge time; newly purchased numbers receive their first 30-day date in the
-- purchase saga.
UPDATE "PhoneNumber"
SET
  "nextBillingAt" = CURRENT_TIMESTAMP + INTERVAL '7 days',
  "billingRateCatalogVersion" = '2026-08-01'
WHERE "nextBillingAt" IS NULL;

CREATE UNIQUE INDEX "BillingAccount_organizationId_key"
  ON "BillingAccount"("organizationId");
CREATE INDEX "BillingAccount_autoRechargeEnabled_idx"
  ON "BillingAccount"("autoRechargeEnabled");

CREATE UNIQUE INDEX "BillingTransaction_billingAccountId_idempotencyKey_key"
  ON "BillingTransaction"("billingAccountId", "idempotencyKey");
CREATE INDEX "BillingTransaction_organizationId_createdAt_idx"
  ON "BillingTransaction"("organizationId", "createdAt");
CREATE INDEX "BillingTransaction_referenceType_referenceId_idx"
  ON "BillingTransaction"("referenceType", "referenceId");
CREATE INDEX "BillingTransaction_type_createdAt_idx"
  ON "BillingTransaction"("type", "createdAt");

CREATE UNIQUE INDEX "BillingReservation_billingAccountId_idempotencyKey_key"
  ON "BillingReservation"("billingAccountId", "idempotencyKey");
CREATE INDEX "BillingReservation_organizationId_status_idx"
  ON "BillingReservation"("organizationId", "status");
CREATE INDEX "BillingReservation_referenceType_referenceId_idx"
  ON "BillingReservation"("referenceType", "referenceId");
CREATE INDEX "BillingReservation_expiresAt_idx"
  ON "BillingReservation"("expiresAt");

CREATE UNIQUE INDEX "PromotionalGrant_userId_key" ON "PromotionalGrant"("userId");
CREATE UNIQUE INDEX "PromotionalGrant_identityHash_key" ON "PromotionalGrant"("identityHash");
CREATE UNIQUE INDEX "PromotionalGrant_organizationId_key"
  ON "PromotionalGrant"("organizationId");
CREATE UNIQUE INDEX "PromotionalGrant_billingAccountId_key"
  ON "PromotionalGrant"("billingAccountId");
CREATE UNIQUE INDEX "PromotionalGrant_billingTransactionId_key"
  ON "PromotionalGrant"("billingTransactionId");

CREATE UNIQUE INDEX "TopUp_stripeCheckoutSessionId_key"
  ON "TopUp"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "TopUp_stripePaymentIntentId_key"
  ON "TopUp"("stripePaymentIntentId");
CREATE UNIQUE INDEX "TopUp_stripeTaxCalculationId_key"
  ON "TopUp"("stripeTaxCalculationId");
CREATE UNIQUE INDEX "TopUp_billingAccountId_idempotencyKey_key"
  ON "TopUp"("billingAccountId", "idempotencyKey");
CREATE UNIQUE INDEX "TopUp_billingAccountId_automaticContextKey_key"
  ON "TopUp"("billingAccountId", "automaticContextKey");
-- Prevent concurrent threshold checks from initiating multiple off-session
-- card charges while still allowing another reload after the first resolves.
CREATE UNIQUE INDEX "TopUp_one_pending_auto_per_account_key"
  ON "TopUp"("billingAccountId")
  WHERE "status" = 'PENDING' AND "kind" = 'AUTOMATIC';
CREATE INDEX "TopUp_organizationId_createdAt_idx"
  ON "TopUp"("organizationId", "createdAt");
CREATE INDEX "TopUp_status_createdAt_idx" ON "TopUp"("status", "createdAt");
CREATE INDEX "TopUp_kind_status_reconciliationNextAt_idx"
  ON "TopUp"("kind", "status", "reconciliationNextAt");
CREATE INDEX "TopUp_financialReconciliationPending_financialProcessingExpiresAt_idx"
  ON "TopUp"("financialReconciliationPending", "financialProcessingExpiresAt");

CREATE UNIQUE INDEX "CallBillingSession_callId_key" ON "CallBillingSession"("callId");
CREATE UNIQUE INDEX "CallBillingSession_sessionId_key" ON "CallBillingSession"("sessionId");
CREATE INDEX "CallBillingSession_organizationId_status_idx"
  ON "CallBillingSession"("organizationId", "status");
CREATE INDEX "CallBillingSession_providerCallId_idx"
  ON "CallBillingSession"("providerCallId");
CREATE INDEX "CallBillingSession_roomName_idx" ON "CallBillingSession"("roomName");
CREATE INDEX "CallBillingSession_agentId_idx" ON "CallBillingSession"("agentId");
CREATE INDEX "CallBillingSession_userId_idx" ON "CallBillingSession"("userId");
CREATE INDEX "CallBillingSession_status_endedAt_idx"
  ON "CallBillingSession"("status", "endedAt");
CREATE INDEX "CallBillingSession_status_reconciliationNextAt_idx"
  ON "CallBillingSession"("status", "reconciliationNextAt");

CREATE UNIQUE INDEX "TelephonyCostReport_externalReportId_key"
  ON "TelephonyCostReport"("externalReportId");
CREATE UNIQUE INDEX "TelephonyCostReport_provider_periodStart_periodEnd_key"
  ON "TelephonyCostReport"("provider", "periodStart", "periodEnd");
CREATE INDEX "TelephonyCostReport_provider_status_nextAttemptAt_idx"
  ON "TelephonyCostReport"("provider", "status", "nextAttemptAt");

CREATE INDEX "StripeWebhookEvent_organizationId_receivedAt_idx"
  ON "StripeWebhookEvent"("organizationId", "receivedAt");
CREATE INDEX "StripeWebhookEvent_status_receivedAt_idx"
  ON "StripeWebhookEvent"("status", "receivedAt");
CREATE INDEX "StripeWebhookEvent_type_receivedAt_idx"
  ON "StripeWebhookEvent"("type", "receivedAt");

CREATE INDEX "PhoneNumber_billingStatus_nextBillingAt_idx"
  ON "PhoneNumber"("billingStatus", "nextBillingAt");
CREATE INDEX "PhoneNumber_billingStatus_scheduledReleaseAt_idx"
  ON "PhoneNumber"("billingStatus", "scheduledReleaseAt");

ALTER TABLE "BillingAccount"
  ADD CONSTRAINT "BillingAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingTransaction"
  ADD CONSTRAINT "BillingTransaction_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("billingAccountId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingTransaction"
  ADD CONSTRAINT "BillingTransaction_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingReservation"
  ADD CONSTRAINT "BillingReservation_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("billingAccountId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingReservation"
  ADD CONSTRAINT "BillingReservation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromotionalGrant"
  ADD CONSTRAINT "PromotionalGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionalGrant"
  ADD CONSTRAINT "PromotionalGrant_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionalGrant"
  ADD CONSTRAINT "PromotionalGrant_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("billingAccountId")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionalGrant"
  ADD CONSTRAINT "PromotionalGrant_billingTransactionId_fkey"
  FOREIGN KEY ("billingTransactionId") REFERENCES "BillingTransaction"("billingTransactionId")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TopUp"
  ADD CONSTRAINT "TopUp_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("billingAccountId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopUp"
  ADD CONSTRAINT "TopUp_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallBillingSession"
  ADD CONSTRAINT "CallBillingSession_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("billingAccountId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallBillingSession"
  ADD CONSTRAINT "CallBillingSession_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StripeWebhookEvent"
  ADD CONSTRAINT "StripeWebhookEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Every selectable model must have a deployed, versioned billing rate. Move
-- legacy/unsupported configurations to supported provider-qualified IDs so
-- the prepaid launch cannot create unpriced calls.
ALTER TABLE "AgentConfiguration"
  ALTER COLUMN "llmModel" SET DEFAULT 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  ALTER COLUMN "sttModel" SET DEFAULT 'deepgram/nova-3',
  ALTER COLUMN "ttsModel" SET DEFAULT 'deepgram/aura-2';

UPDATE "AgentConfiguration"
SET "llmModel" = CASE
  WHEN "llmModel" IN (
    'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
    'bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'bedrock/us.amazon.nova-micro-v1:0',
    'bedrock/us.amazon.nova-lite-v1:0'
  ) THEN "llmModel"
  ELSE 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0'
END;

UPDATE "AgentConfiguration"
SET "sttModel" = CASE
  WHEN "sttModel" IN ('deepgram/nova-3', 'deepgram/nova-3-multilingual', 'deepgram/nova-2', 'sarvam/saaras:v3')
    THEN "sttModel"
  WHEN "sttModel" = 'nova-3' AND "agent_language" IN ('hi', 'en-IN')
    THEN 'deepgram/nova-3-multilingual'
  WHEN "sttModel" = 'nova-2' THEN 'deepgram/nova-2'
  WHEN "sttModel" = 'saaras:v3' THEN 'sarvam/saaras:v3'
  WHEN "agent_language" IN ('hi', 'en-IN') THEN 'deepgram/nova-3-multilingual'
  ELSE 'deepgram/nova-3'
END;

UPDATE "AgentConfiguration"
SET "ttsModel" = CASE
  WHEN "ttsModel" IN ('deepgram/aura-2', 'elevenlabs/eleven_flash_v2_5', 'elevenlabs/eleven_turbo_v2_5', 'sarvam/bulbul:v3')
    THEN "ttsModel"
  WHEN "ttsModel" = 'aura-2' THEN 'deepgram/aura-2'
  WHEN "ttsModel" IN ('eleven_flash_v2_5', 'eleven-flash-v2.5') THEN 'elevenlabs/eleven_flash_v2_5'
  WHEN "ttsModel" IN ('eleven_turbo_v2_5', 'eleven-turbo-v2.5') THEN 'elevenlabs/eleven_turbo_v2_5'
  WHEN "ttsModel" = 'bulbul:v3' THEN 'sarvam/bulbul:v3'
  ELSE 'deepgram/aura-2'
END;
