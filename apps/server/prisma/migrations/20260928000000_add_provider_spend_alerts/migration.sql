CREATE TABLE "ProviderSpendDay" (
    "sourceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "amountMicros" BIGINT NOT NULL CHECK ("amountMicros" >= 0),
    "baselineMicros" BIGINT,
    "baselineDays" INTEGER NOT NULL DEFAULT 0,
    "estimated" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "sourceAsOf" TIMESTAMP(3),
    PRIMARY KEY ("sourceId", "day")
);
CREATE TABLE "ProviderSpendAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "severity" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ProviderSpendDelivery" (
    "alertId" TEXT NOT NULL REFERENCES "ProviderSpendAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "email" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("alertId", "email")
);
CREATE INDEX "ProviderSpendDelivery_sentAt_claimedAt_idx" ON "ProviderSpendDelivery"("sentAt", "claimedAt");
CREATE INDEX "ProviderSpendAlert_sourceId_day_idx" ON "ProviderSpendAlert"("sourceId", "day");
