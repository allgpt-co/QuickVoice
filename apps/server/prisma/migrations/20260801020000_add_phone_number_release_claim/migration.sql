-- Fence renewal and provider release behind one durable operation lease. The
-- RELEASING serializes the last-chance funding check with provider release;
-- billingReleaseClaimedAt records its durable point-of-no-return, while the
-- token prevents stale workers from settling or deleting.

ALTER TYPE "PhoneNumberBillingStatus" ADD VALUE 'RELEASING' BEFORE 'RELEASED';

ALTER TABLE "PhoneNumber"
  ADD COLUMN "billingOperationToken" TEXT,
  ADD COLUMN "billingOperationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "billingReleaseClaimedAt" TIMESTAMP(3);

CREATE INDEX "PhoneNumber_billingStatus_billingOperationExpiresAt_idx"
  ON "PhoneNumber"("billingStatus", "billingOperationExpiresAt");
