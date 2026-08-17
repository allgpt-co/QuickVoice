CREATE TABLE "CampaignPersonalizationSchema" (
  "schemaId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "fields" JSONB NOT NULL,
  "templates" JSONB NOT NULL DEFAULT '{}',
  "attribution" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignPersonalizationSchema_pkey" PRIMARY KEY ("schemaId")
);

CREATE TABLE "CampaignRecipientSnapshot" (
  "snapshotId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "outboundId" TEXT,
  "schemaVersion" INTEGER NOT NULL,
  "rowNumber" INTEGER,
  "recipientKey" TEXT NOT NULL,
  "values" JSONB NOT NULL,
  "findings" JSONB NOT NULL DEFAULT '[]',
  "renderedConfigDigest" TEXT NOT NULL,
  "renderedPreview" JSONB NOT NULL DEFAULT '{}',
  "skipped" BOOLEAN NOT NULL DEFAULT false,
  "skipReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRecipientSnapshot_pkey" PRIMARY KEY ("snapshotId")
);

CREATE TABLE "CampaignExperiment" (
  "experimentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "startedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignExperiment_pkey" PRIMARY KEY ("experimentId")
);

CREATE TABLE "CampaignExperimentVariant" (
  "variantId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "allocationBps" INTEGER NOT NULL,
  "configVersion" JSONB NOT NULL,
  "isControl" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignExperimentVariant_pkey" PRIMARY KEY ("variantId")
);

CREATE TABLE "CampaignExperimentAssignment" (
  "assignmentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "outboundId" TEXT,
  "unitKey" TEXT NOT NULL,
  "assignmentHash" TEXT NOT NULL,
  "excluded" BOOLEAN NOT NULL DEFAULT false,
  "exclusionReason" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignExperimentAssignment_pkey" PRIMARY KEY ("assignmentId")
);

CREATE TABLE "CampaignGoal" (
  "goalId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "attributionPolicy" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignGoal_pkey" PRIMARY KEY ("goalId")
);

CREATE TABLE "CampaignConversionEvent" (
  "conversionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "goalId" TEXT,
  "goalKey" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "externalCustomerId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valueCents" INTEGER,
  "currency" TEXT,
  "source" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "rejected" BOOLEAN NOT NULL DEFAULT false,
  "rejectionReason" TEXT,
  CONSTRAINT "CampaignConversionEvent_pkey" PRIMARY KEY ("conversionId")
);

CREATE TABLE "CampaignAttributionResult" (
  "attributionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "conversionId" TEXT NOT NULL,
  "goalId" TEXT,
  "experimentId" TEXT,
  "variantId" TEXT,
  "outboundId" TEXT,
  "policyVersion" INTEGER NOT NULL,
  "model" TEXT NOT NULL,
  "attributedValueCents" INTEGER,
  "evidence" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "CampaignAttributionResult_pkey" PRIMARY KEY ("attributionId")
);

CREATE TABLE "CampaignReportSnapshot" (
  "reportId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "definitionsVersion" INTEGER NOT NULL,
  "dataFreshnessAt" TIMESTAMP(3) NOT NULL,
  "report" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignReportSnapshot_pkey" PRIMARY KEY ("reportId")
);

CREATE UNIQUE INDEX "CampaignPersonalizationSchema_campaignId_version_key" ON "CampaignPersonalizationSchema"("campaignId", "version");
CREATE INDEX "CampaignPersonalizationSchema_organizationId_idx" ON "CampaignPersonalizationSchema"("organizationId");
CREATE INDEX "CampaignPersonalizationSchema_campaignId_idx" ON "CampaignPersonalizationSchema"("campaignId");

CREATE INDEX "CampaignRecipientSnapshot_organizationId_idx" ON "CampaignRecipientSnapshot"("organizationId");
CREATE INDEX "CampaignRecipientSnapshot_campaignId_idx" ON "CampaignRecipientSnapshot"("campaignId");
CREATE INDEX "CampaignRecipientSnapshot_outboundId_idx" ON "CampaignRecipientSnapshot"("outboundId");
CREATE UNIQUE INDEX "CampaignRecipientSnapshot_campaignId_recipientKey_schemaVersion_key" ON "CampaignRecipientSnapshot"("campaignId", "recipientKey", "schemaVersion");

CREATE UNIQUE INDEX "CampaignExperiment_campaignId_version_key" ON "CampaignExperiment"("campaignId", "version");
CREATE INDEX "CampaignExperiment_organizationId_idx" ON "CampaignExperiment"("organizationId");
CREATE INDEX "CampaignExperiment_campaignId_idx" ON "CampaignExperiment"("campaignId");
CREATE INDEX "CampaignExperiment_status_idx" ON "CampaignExperiment"("status");

CREATE UNIQUE INDEX "CampaignExperimentVariant_experimentId_key_key" ON "CampaignExperimentVariant"("experimentId", "key");
CREATE INDEX "CampaignExperimentVariant_experimentId_idx" ON "CampaignExperimentVariant"("experimentId");

CREATE UNIQUE INDEX "CampaignExperimentAssignment_experimentId_unitKey_key" ON "CampaignExperimentAssignment"("experimentId", "unitKey");
CREATE INDEX "CampaignExperimentAssignment_organizationId_idx" ON "CampaignExperimentAssignment"("organizationId");
CREATE INDEX "CampaignExperimentAssignment_campaignId_idx" ON "CampaignExperimentAssignment"("campaignId");
CREATE INDEX "CampaignExperimentAssignment_variantId_idx" ON "CampaignExperimentAssignment"("variantId");
CREATE INDEX "CampaignExperimentAssignment_outboundId_idx" ON "CampaignExperimentAssignment"("outboundId");

CREATE UNIQUE INDEX "CampaignGoal_campaignId_key_version_key" ON "CampaignGoal"("campaignId", "key", "version");
CREATE INDEX "CampaignGoal_organizationId_idx" ON "CampaignGoal"("organizationId");
CREATE INDEX "CampaignGoal_campaignId_idx" ON "CampaignGoal"("campaignId");

CREATE UNIQUE INDEX "CampaignConversionEvent_organizationId_dedupeKey_key" ON "CampaignConversionEvent"("organizationId", "dedupeKey");
CREATE INDEX "CampaignConversionEvent_organizationId_idx" ON "CampaignConversionEvent"("organizationId");
CREATE INDEX "CampaignConversionEvent_campaignId_idx" ON "CampaignConversionEvent"("campaignId");
CREATE INDEX "CampaignConversionEvent_goalKey_idx" ON "CampaignConversionEvent"("goalKey");
CREATE INDEX "CampaignConversionEvent_externalCustomerId_idx" ON "CampaignConversionEvent"("externalCustomerId");

CREATE INDEX "CampaignAttributionResult_organizationId_idx" ON "CampaignAttributionResult"("organizationId");
CREATE INDEX "CampaignAttributionResult_campaignId_idx" ON "CampaignAttributionResult"("campaignId");
CREATE INDEX "CampaignAttributionResult_conversionId_idx" ON "CampaignAttributionResult"("conversionId");
CREATE INDEX "CampaignAttributionResult_experimentId_idx" ON "CampaignAttributionResult"("experimentId");
CREATE INDEX "CampaignAttributionResult_variantId_idx" ON "CampaignAttributionResult"("variantId");

CREATE INDEX "CampaignReportSnapshot_organizationId_idx" ON "CampaignReportSnapshot"("organizationId");
CREATE INDEX "CampaignReportSnapshot_campaignId_idx" ON "CampaignReportSnapshot"("campaignId");
CREATE INDEX "CampaignReportSnapshot_scope_idx" ON "CampaignReportSnapshot"("scope");

ALTER TABLE "CampaignPersonalizationSchema" ADD CONSTRAINT "CampaignPersonalizationSchema_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignPersonalizationSchema" ADD CONSTRAINT "CampaignPersonalizationSchema_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignRecipientSnapshot" ADD CONSTRAINT "CampaignRecipientSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipientSnapshot" ADD CONSTRAINT "CampaignRecipientSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipientSnapshot" ADD CONSTRAINT "CampaignRecipientSnapshot_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "OutboundCall"("outboundId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignExperiment" ADD CONSTRAINT "CampaignExperiment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExperiment" ADD CONSTRAINT "CampaignExperiment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignExperimentVariant" ADD CONSTRAINT "CampaignExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "CampaignExperiment"("experimentId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignExperimentAssignment" ADD CONSTRAINT "CampaignExperimentAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExperimentAssignment" ADD CONSTRAINT "CampaignExperimentAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExperimentAssignment" ADD CONSTRAINT "CampaignExperimentAssignment_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "CampaignExperiment"("experimentId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExperimentAssignment" ADD CONSTRAINT "CampaignExperimentAssignment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CampaignExperimentVariant"("variantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExperimentAssignment" ADD CONSTRAINT "CampaignExperimentAssignment_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "OutboundCall"("outboundId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignGoal" ADD CONSTRAINT "CampaignGoal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignConversionEvent" ADD CONSTRAINT "CampaignConversionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignConversionEvent" ADD CONSTRAINT "CampaignConversionEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignConversionEvent" ADD CONSTRAINT "CampaignConversionEvent_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CampaignGoal"("goalId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignAttributionResult" ADD CONSTRAINT "CampaignAttributionResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignAttributionResult" ADD CONSTRAINT "CampaignAttributionResult_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignAttributionResult" ADD CONSTRAINT "CampaignAttributionResult_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "CampaignConversionEvent"("conversionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignAttributionResult" ADD CONSTRAINT "CampaignAttributionResult_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CampaignGoal"("goalId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignAttributionResult" ADD CONSTRAINT "CampaignAttributionResult_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "CampaignExperiment"("experimentId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignAttributionResult" ADD CONSTRAINT "CampaignAttributionResult_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CampaignExperimentVariant"("variantId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignAttributionResult" ADD CONSTRAINT "CampaignAttributionResult_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "OutboundCall"("outboundId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignReportSnapshot" ADD CONSTRAINT "CampaignReportSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignReportSnapshot" ADD CONSTRAINT "CampaignReportSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;
