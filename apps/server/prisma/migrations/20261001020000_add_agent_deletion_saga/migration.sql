ALTER TABLE "Agent"
ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN "deletionAttemptedAt" TIMESTAMP(3),
ADD COLUMN "deletionError" TEXT;

CREATE INDEX "Agent_deletionRequestedAt_idx"
ON "Agent"("deletionRequestedAt");
