import {
  CampaignStatus,
  Prisma,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import type {
  CampaignConversionEventInput,
  CampaignExperimentDefinition,
  CampaignGoalDefinition,
  CampaignPersonalizationSchemaInput,
} from "./outbound-campaign-intelligence.schema.js";
import { assignExperimentVariants } from "./outbound-campaign-intelligence.service.js";

export type CampaignIntelligencePersistenceInput = {
  organizationId: string;
  campaignId: string;
  personalizationSchema?: CampaignPersonalizationSchemaInput | null;
  experiments: CampaignExperimentDefinition[];
  goals: CampaignGoalDefinition[];
};

type CampaignRecipientSnapshotInput = {
  organizationId: string;
  campaignId: string;
  outboundId?: string | null;
  schemaVersion: number;
  rowNumber?: number | null;
  recipientKey: string;
  values: Record<string, string>;
  findings: unknown[];
  renderedConfigDigest: string;
  renderedPreview: Record<string, string>;
  skipped: boolean;
  skipReason: string | null;
};

type CampaignExperimentAssignmentInput = {
  organizationId: string;
  campaignId: string;
  experimentId: string;
  variantId: string;
  unitKey: string;
  assignmentHash: string;
  excluded: boolean;
  exclusionReason: string | null;
};

type CampaignConversionAttributionInput = {
  organizationId: string;
  campaignId: string;
  conversionId: string;
  goalId: string | null;
  experimentId: string | null;
  variantId: string | null;
  model: string;
  policyVersion: number;
  attributedValueCents: number | null;
  evidence: Record<string, unknown>;
};

type CampaignReportSnapshotInput = {
  organizationId: string;
  campaignId: string;
  scope: string;
  definitionsVersion: number;
  report: Record<string, unknown>;
  dataFreshnessAt: Date;
};

export async function createCampaignIntelligence(
  input: CampaignIntelligencePersistenceInput,
) {
  if (
    !input.personalizationSchema &&
    input.experiments.length === 0 &&
    input.goals.length === 0
  ) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    if (input.personalizationSchema) {
      await tx.campaignPersonalizationSchema.create({
        data: {
          campaignId: input.campaignId,
          organizationId: input.organizationId,
          version: input.personalizationSchema.version,
          fields:
            input.personalizationSchema.fields as unknown as Prisma.JsonArray,
          templates:
            input.personalizationSchema.templates as unknown as Prisma.JsonObject,
          attribution:
            input.personalizationSchema.attribution as unknown as Prisma.JsonObject,
        },
      });
    }

    for (const experiment of input.experiments) {
      const createdExperiment = await tx.campaignExperiment.create({
        data: {
          campaignId: input.campaignId,
          organizationId: input.organizationId,
          version: experiment.version,
          definition: experiment as unknown as Prisma.JsonObject,
        },
      });

      await tx.campaignExperimentVariant.createMany({
        data: experiment.variants.map((variant) => ({
          experimentId: createdExperiment.experimentId,
          key: variant.key,
          name: variant.name,
          allocationBps: variant.allocationBps,
          isControl: variant.isControl,
          configVersion: variant.configVersion as unknown as Prisma.JsonObject,
        })),
      });
    }

    for (const goal of input.goals) {
      await tx.campaignGoal.create({
        data: {
          campaignId: input.campaignId,
          organizationId: input.organizationId,
          key: goal.key,
          version: goal.version,
          definition: goal.definition as unknown as Prisma.JsonObject,
          attributionPolicy: goal.attributionPolicy as unknown as Prisma.JsonObject,
        },
      });
    }
  });
}

export async function getCampaignForImport(campaignId: string) {
  return prisma.campaign.findFirst({
    where: {
      campaignId,
      status: CampaignStatus.SCHEDULED,
    },
    select: {
      campaignId: true,
      organizationId: true,
      userId: true,
      agentId: true,
      fromNumber: true,
      scheduledAt: true,
      sourceFileKey: true,
      sourceFileName: true,
      ringingTimeoutSeconds: true,
      personalizationSchemas: {
        select: {
          schemaId: true,
          version: true,
          fields: true,
          templates: true,
          attribution: true,
        },
        orderBy: { version: "desc" },
      },
      experiments: {
        select: {
          experimentId: true,
          version: true,
          definition: true,
          variants: {
            select: {
              variantId: true,
              key: true,
              name: true,
              allocationBps: true,
              isControl: true,
              configVersion: true,
            },
          },
        },
        orderBy: { version: "desc" },
      },
      goals: {
        select: {
          goalId: true,
          key: true,
          version: true,
          definition: true,
          attributionPolicy: true,
        },
        orderBy: { version: "desc" },
      },
    },
  });
}

export async function createCampaignRecipientSnapshots(
  rows: CampaignRecipientSnapshotInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.campaignRecipientSnapshot.createMany({
    data: rows.map((row) => {
      return {
        organizationId: row.organizationId,
        campaignId: row.campaignId,
        outboundId: row.outboundId,
        schemaVersion: row.schemaVersion,
        rowNumber: row.rowNumber,
        recipientKey: row.recipientKey,
        values: row.values as unknown as Prisma.JsonObject,
        findings: row.findings as unknown as Prisma.JsonArray,
        renderedConfigDigest: row.renderedConfigDigest,
        renderedPreview: row.renderedPreview as unknown as Prisma.JsonObject,
        skipped: row.skipped,
        skipReason: row.skipReason,
      };
    }),
  });
}

export async function createCampaignExperimentAssignments(
  rows: CampaignExperimentAssignmentInput[],
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.campaignExperimentAssignment.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

export async function hasConversionDedupeKey(organizationId: string, dedupeKey: string) {
  return prisma.campaignConversionEvent.findFirst({
    where: { organizationId, dedupeKey },
    select: { conversionId: true },
  });
}

export async function getCampaignGoalForKey(campaignId: string, goalKey: string) {
  return prisma.campaignGoal.findFirst({
    where: { campaignId, key: goalKey },
    orderBy: { version: "desc" },
    select: { goalId: true },
  });
}

export async function createCampaignConversionEvent(
  input: Omit<CampaignConversionEventInput, "occurredAt"> & {
    organizationId: string;
    campaignId: string;
    occurredAt: Date;
    goalId: string | null;
    rejected: boolean;
    rejectionReason: string | null;
  },
) {
  return prisma.campaignConversionEvent.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      goalId: input.goalId,
      goalKey: input.goalKey,
      dedupeKey: input.dedupeKey,
      externalCustomerId: input.externalCustomerId,
      occurredAt: input.occurredAt,
      valueCents: input.valueCents,
      currency: input.currency?.toUpperCase(),
      source: input.source,
      evidence: input.evidence as unknown as Prisma.JsonObject,
      rejected: input.rejected,
      rejectionReason: input.rejectionReason,
      revision: 1,
    } as Prisma.CampaignConversionEventUncheckedCreateInput,
  });
}

export async function getAssignmentsForUnit(campaignId: string, unitKey: string) {
  return prisma.campaignExperimentAssignment.findMany({
    where: { campaignId, unitKey, excluded: false },
    include: {
      experiment: {
        select: {
          experimentId: true,
          definition: true,
        },
      },
      variant: {
        select: {
          variantId: true,
          key: true,
          experimentId: true,
        },
      },
    },
  });
}

export async function createCampaignConversionAttributions(
  rows: CampaignConversionAttributionInput[],
) {
  if (rows.length === 0) return { count: 0 };

  return prisma.campaignAttributionResult.createMany({
    data: rows.map((row) => {
      return {
        organizationId: row.organizationId,
        campaignId: row.campaignId,
        conversionId: row.conversionId,
        goalId: row.goalId,
        experimentId: row.experimentId,
        variantId: row.variantId,
        policyVersion: row.policyVersion,
        model: row.model,
        attributedValueCents: row.attributedValueCents,
        evidence: row.evidence as unknown as Prisma.JsonObject,
      };
    }),
  });
}

export async function getCampaignForConversion(campaignId: string, organizationId: string) {
  return prisma.campaign.findFirst({
    where: { campaignId, organizationId },
    select: {
      campaignId: true,
      organizationId: true,
      goals: {
        select: {
          goalId: true,
          key: true,
          version: true,
        },
        orderBy: { version: "desc" },
      },
    },
  });
}

export async function getCampaignForReport(campaignId: string, organizationId: string) {
  return prisma.campaign.findFirst({
    where: { campaignId, organizationId },
    select: {
      campaignId: true,
      organizationId: true,
      personalizationSchemas: {
        select: {
          version: true,
        },
        orderBy: { version: "desc" },
      },
      experiments: {
        select: {
          experimentId: true,
          version: true,
          definition: true,
        },
      },
      goals: {
        select: {
          goalId: true,
          key: true,
          version: true,
        },
      },
      outboundCalls: {
        select: {
          outboundId: true,
          optionalData: true,
          status: true,
          callLog: {
            select: {
              status: true,
              callCostCents: true,
            },
          },
        },
      },
      experimentAssignments: {
        select: {
          unitKey: true,
          experimentId: true,
          variant: {
            select: {
              variantId: true,
              key: true,
            },
          },
        },
      },
      conversionEvents: {
        where: { rejected: false },
        select: {
          externalCustomerId: true,
          goalKey: true,
          valueCents: true,
          conversionId: true,
        },
      },
    },
  });
}

export async function createCampaignReportSnapshot(
  input: CampaignReportSnapshotInput,
) {
  return prisma.campaignReportSnapshot.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      scope: input.scope,
      definitionsVersion: input.definitionsVersion,
      dataFreshnessAt: input.dataFreshnessAt,
      report: input.report as unknown as Prisma.JsonObject,
    },
  });
}

export function buildRecipientAssignments(
  experiment: CampaignExperimentDefinition,
  unitKeys: string[],
  excludedUnitKeys: Record<string, string> = {},
) {
  return assignExperimentVariants({
    experiment,
    unitKeys,
    excludedUnitKeys,
  });
}

export type CampaignRecipientSnapshotCandidate = {
  recipientKey: string;
  rowNumber?: number;
  values: Record<string, string>;
  schemaVersion: number;
  findings: unknown[];
  skipReason: string | null;
  skipped: boolean;
  renderedPreview: Record<string, string>;
  renderedConfigDigest: string;
};

export type CampaignImportCampaign = NonNullable<
  Awaited<ReturnType<typeof getCampaignForImport>>
>;

export type CampaignReportCampaignData = NonNullable<
  Awaited<ReturnType<typeof getCampaignForReport>>
>;
