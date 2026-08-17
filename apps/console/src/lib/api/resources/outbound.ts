import { apiClient } from "@/src/lib/api/client";
import type { ApiEnvelope, CallStatus } from "@/src/lib/api/types";
import type { QuickCallInput } from "@/src/models/outbound/quickCall";

export type CampaignIntelligenceFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "enum";
export type CampaignIntelligenceMissingBehavior = "fallback" | "omit" | "skip";
export type CampaignIntelligenceSource =
  | "customer_attribute"
  | "audience_snapshot"
  | "campaign_constant"
  | "computed_safe"
  | "connector_lookup";

export interface CampaignPersonalizationField {
  name: string;
  type: CampaignIntelligenceFieldType;
  source: CampaignIntelligenceSource;
  required: boolean;
  sensitive?: boolean;
  description?: string;
  defaultValue?: string | number | boolean;
  missingBehavior?: CampaignIntelligenceMissingBehavior;
  invalidBehavior?: CampaignIntelligenceMissingBehavior;
  allowedValues?: string[];
  maxLength?: number;
  locale?: string;
}

export interface CampaignPersonalizationSchema {
  version?: number;
  fields: CampaignPersonalizationField[];
  templates: Record<string, string>;
  attribution: Record<string, unknown>;
}

export interface CampaignExperimentVariant {
  key: string;
  name: string;
  allocationBps: number;
  isControl?: boolean;
  configVersion?: Record<string, unknown>;
}

export interface CampaignExperimentDefinition {
  experimentId: string;
  version?: number;
  hypothesis: string;
  primaryMetric: string;
  guardrailMetrics: string[];
  unit: "recipient" | "household" | "account";
  stoppingPolicy: string;
  variants: CampaignExperimentVariant[];
}

export interface CampaignGoalDefinition {
  key: string;
  version?: number;
  definition: Record<string, unknown>;
  attributionPolicy: Record<string, unknown>;
}

export interface CampaignBatchIntelligence {
  personalizationSchema?: CampaignPersonalizationSchema;
  experiments: CampaignExperimentDefinition[];
  goals: CampaignGoalDefinition[];
}

export interface CampaignRecipientValue {
  recipientKey: string;
  rowNumber?: number;
  values: Record<string, string>;
}

export interface CampaignPersonalizationPreflightRequest {
  schema: CampaignPersonalizationSchema;
  recipients: CampaignRecipientValue[];
  includeSensitivePreview?: boolean;
}

export interface CampaignPersonalizationPreflightResponse {
  campaignId: string;
  schemaVersion: number;
  selectedRecipients: number;
  validRecipients: number;
  skippedRecipients: number;
  rows: Array<{
    recipientKey: string;
    rowNumber: number | null;
    skipped: boolean;
    skipReason: string | null;
    findings: unknown[];
    renderedPreview: Record<string, unknown>;
    maskedPreview?: Record<string, unknown>;
  }>;
}

export interface CampaignExperimentAssignmentRequest {
  experiment: CampaignExperimentDefinition;
  unitKeys: string[];
  excludedUnitKeys?: Record<string, string>;
}

export interface CampaignExperimentAssignmentResponse {
  campaignId: string;
  experimentId: string;
  version: number;
  unit: CampaignExperimentDefinition["unit"];
  assignments: Array<{
    unitKey: string;
    variantKey: string;
    assignmentHash: string;
    bucket: number | null;
    excluded: boolean;
    exclusionReason: string | null;
  }>;
  balance: Array<{
    variantKey: string;
    expectedBps: number;
    observedBps: number;
    assigned: number;
    imbalanceBps: number;
    warning: string | null;
  }>;
}

export interface CampaignConversionEventInput {
  goalKey: string;
  dedupeKey: string;
  externalCustomerId: string;
  occurredAt: string;
  valueCents?: number;
  currency?: string;
  source: string;
  evidence: Record<string, unknown>;
}

export interface CampaignConversionEventResponse {
  campaignId: string;
  accepted: boolean;
  canonical: CampaignConversionEventInput & { occurredAt: string; currency?: string };
  findings: unknown[];
  conversionId?: string;
  attributedAssignments?: number;
}

export interface CampaignReportBuildRequest {
  randomized?: boolean;
  persistReport?: boolean;
}

export interface CampaignReportBuildResponse {
  campaignId: string;
  evidenceLabel: string;
  causalClaimAllowed: boolean;
  dataFreshnessAt: string;
  variants: Array<{
    variantKey: string;
    audience: number;
    attempts: number;
    connects: number;
    connectRate: number;
    outcomes: Record<string, number>;
    conversions: number;
    conversionRate: number;
    conversionValueCents: number;
    costCents: number;
    costPerConversionCents: number | null;
    confidenceInterval: {
      low: number;
      high: number;
      observedRate: number;
      note: string;
    };
  }>;
  totals: {
    audience: number;
    attempts: number;
    connects: number;
    conversions: number;
    conversionValueCents: number;
    costCents: number;
  };
  reportId?: string;
}

export interface OutboundCall {
  outboundId: string;
  organizationId: string;
  agentId: string | null;
  userId: string | null;
  campaignId: string | null;
  scheduledAt: string | null;
  callLogId: string | null;
  phoneNumber: string;
  fromNumber: string;
  firstMessage: string | null;
  systemPrompt: string | null;
  optionalData: Record<string, unknown> | null;
  mode: "quick" | "campaign";
  status: CallStatus;
  failureReason?: string | null;
  cancellationReason?: string | null;
  callLog?: {
    callId: string;
    status: CallStatus;
    startTime: string | null;
    endTime: string | null;
    durationSeconds: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundCallListParams {
  agentId?: string;
  status?: CallStatus;
  mode?: "quick" | "campaign";
  limit?: number;
  cursor?: string;
}

export interface OutboundCallPage {
  items: OutboundCall[];
  count: number;
  filters: Record<string, unknown>;
  nextCursor: string | null;
}

export interface QuickOutboundCallResponse {
  outbound: OutboundCall;
  livekitParticipant: unknown;
  agentDispatch: unknown;
}

export interface BatchUploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  contentType: string;
  maxUploadBytes: number;
}

export interface CreateBatchCampaignInput {
  name: string;
  agentId: string;
  fromNumber: string;
  sourceFileKey: string;
  sourceFileName: string;
  scheduledAt?: string | null;
  timezone: string;
  ringingTimeoutSeconds: number;
  campaignIntelligence?: CampaignBatchIntelligence;
}

export interface BatchCampaign {
  campaignId: string;
  name: string;
  agentId: string | null;
  fromNumber: string;
  scheduledAt: string | null;
  sourceFileKey?: string | null;
  sourceFileName: string | null;
  totalRecipients: number;
  validRecipients: number;
  invalidRecipients: number;
  ringingTimeoutSeconds: number;
  timezone: string;
  status:
    | "SCHEDULED"
    | "ACTIVE"
    | "COMPLETED"
    | "CANCELLED"
    | "PROCESSED"
    | "FAILED";
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  outboundCalls?: OutboundCall[];
}

export interface CampaignResultsCsv {
  blob: Blob;
  filename: string;
}

export const outboundApi = {
  listOutboundCalls: async (
    params: OutboundCallListParams = {},
  ): Promise<OutboundCallPage> => {
    const res = await apiClient.get<ApiEnvelope<OutboundCallPage>>(
      "/outbound-calls",
      { params },
    );
    return res.data.data;
  },
  getOutboundCall: async (outboundId: string): Promise<OutboundCall> => {
    const res = await apiClient.get<ApiEnvelope<OutboundCall>>(
      `/outbound-calls/${outboundId}`,
    );
    return res.data.data;
  },
  cancelOutboundCall: async (outboundId: string): Promise<OutboundCall> => {
    const res = await apiClient.post<ApiEnvelope<OutboundCall>>(
      `/outbound-calls/${outboundId}/cancel`,
      {},
    );
    return res.data.data;
  },
  retryOutboundCall: async (outboundId: string): Promise<unknown> => {
    const res = await apiClient.post<ApiEnvelope<unknown>>(
      `/outbound-calls/${outboundId}/retry`,
      {},
    );
    return res.data.data;
  },
  quickCall: async (
    input: QuickCallInput,
  ): Promise<QuickOutboundCallResponse> => {
    const res = await apiClient.post<ApiEnvelope<QuickOutboundCallResponse>>(
      "/outbound-calls/quick",
      input,
    );
    return res.data.data;
  },
  getBatchUploadUrl: async (
    fileName: string,
    contentType: string,
    fileSize: number,
  ): Promise<BatchUploadUrlResponse> => {
    const res = await apiClient.get<ApiEnvelope<BatchUploadUrlResponse>>(
      "/outbound-calls/batch-upload-url",
      { params: { fileName, contentType, fileSize } },
    );
    return res.data.data;
  },
  createBatchCampaign: async (
    input: CreateBatchCampaignInput,
  ): Promise<BatchCampaign> => {
    const res = await apiClient.post<ApiEnvelope<BatchCampaign>>(
      "/outbound-calls/batches",
      input,
    );
    return res.data.data;
  },
  listBatchCampaigns: async (agentId?: string): Promise<BatchCampaign[]> => {
    const res = await apiClient.get<ApiEnvelope<BatchCampaign[]>>(
      "/outbound-calls/batches",
      { params: agentId ? { agentId } : undefined },
    );
    return res.data.data;
  },
  getBatchCampaign: async (campaignId: string): Promise<BatchCampaign> => {
    const res = await apiClient.get<ApiEnvelope<BatchCampaign>>(
      `/outbound-calls/batches/${campaignId}`,
    );
    return res.data.data;
  },
  downloadBatchCampaignResultsCsv: async (
    campaignId: string,
  ): Promise<CampaignResultsCsv> => {
    const res = await apiClient.get<Blob>(
      `/outbound-calls/batches/${campaignId}/results.csv`,
      { responseType: "blob" },
    );
    return {
      blob: res.data,
      filename:
        filenameFromContentDisposition(res.headers["content-disposition"]) ??
        `quickvoice-campaign-${campaignId}-results.csv`,
    };
  },
  cancelBatchCampaign: async (campaignId: string): Promise<BatchCampaign> => {
    const res = await apiClient.post<ApiEnvelope<BatchCampaign>>(
      `/outbound-calls/batches/${campaignId}/cancel`,
      {},
    );
    return res.data.data;
  },
  preflightCampaignPersonalization: async (
    campaignId: string,
    input: CampaignPersonalizationPreflightRequest
  ): Promise<CampaignPersonalizationPreflightResponse> => {
    const res = await apiClient.post<ApiEnvelope<CampaignPersonalizationPreflightResponse>>(
      `/outbound-calls/batches/${campaignId}/personalization/preflight`,
      input
    );
    return res.data.data;
  },
  computeCampaignAssignments: async (
    campaignId: string,
    input: CampaignExperimentAssignmentRequest
  ): Promise<CampaignExperimentAssignmentResponse> => {
    const res = await apiClient.post<ApiEnvelope<CampaignExperimentAssignmentResponse>>(
      `/outbound-calls/batches/${campaignId}/experiments/assignments`,
      input
    );
    return res.data.data;
  },
  validateCampaignConversion: async (
    campaignId: string,
    input: CampaignConversionEventInput
  ): Promise<CampaignConversionEventResponse> => {
    const res = await apiClient.post<ApiEnvelope<CampaignConversionEventResponse>>(
      `/outbound-calls/batches/${campaignId}/conversions/validate`,
      input
    );
    return res.data.data;
  },
  ingestCampaignConversion: async (
    campaignId: string,
    input: CampaignConversionEventInput
  ): Promise<CampaignConversionEventResponse> => {
    const res = await apiClient.post<ApiEnvelope<CampaignConversionEventResponse>>(
      `/outbound-calls/batches/${campaignId}/conversions`,
      input
    );
    return res.data.data;
  },
  buildCampaignReport: async (
    campaignId: string,
    input: CampaignReportBuildRequest
  ): Promise<CampaignReportBuildResponse> => {
    const res = await apiClient.post<ApiEnvelope<CampaignReportBuildResponse>>(
      `/outbound-calls/batches/${campaignId}/reports/preview`,
      input
    );
    return res.data.data;
  },
};

function filenameFromContentDisposition(value: unknown) {
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== "string") return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  return /filename="?([^";]+)"?/i.exec(header)?.[1] ?? null;
}
