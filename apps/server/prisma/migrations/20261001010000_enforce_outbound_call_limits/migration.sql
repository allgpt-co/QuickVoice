ALTER TABLE "OutboundCall"
ADD COLUMN "dispatchClaimedAt" TIMESTAMP(3);

CREATE INDEX "OutboundCall_agentId_dispatchClaimedAt_idx"
ON "OutboundCall"("agentId", "dispatchClaimedAt");
