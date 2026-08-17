import { createHash } from "node:crypto";
import type {
  CampaignAssignmentRequest,
  CampaignConversionEventInput,
  CampaignExperimentDefinition,
  CampaignPersonalizationSchemaInput,
  CampaignPreflightRequest,
  CampaignReportRequest,
} from "./outbound-campaign-intelligence.schema.js";

type FindingSeverity = "error" | "warning" | "info";

type Finding = {
  field?: string;
  code: string;
  severity: FindingSeverity;
  message: string;
};

type NormalizedValue = {
  present: boolean;
  valid: boolean;
  value?: string | number | boolean;
  display?: string;
  finding?: Finding;
};

const TOKEN_RE = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;

export function preflightCampaignPersonalization(
  request: CampaignPreflightRequest,
) {
  const fieldNames = new Set<string>();
  const schemaFindings: Finding[] = [];
  for (const field of request.schema.fields) {
    if (fieldNames.has(field.name)) {
      schemaFindings.push({
        field: field.name,
        code: "DUPLICATE_FIELD",
        severity: "error",
        message: "Field names must be unique",
      });
    }
    fieldNames.add(field.name);
  }

  const rows = request.recipients.map((recipient) => {
    const findings: Finding[] = [...schemaFindings];
    const normalizedValues: Record<string, string | number | boolean> = {};
    const previewValues: Record<string, string | number | boolean> = {};
    let skipped = schemaFindings.some(
      (finding) => finding.severity === "error",
    );
    let skipReason = skipped ? "Personalization schema is invalid" : null;

    for (const field of request.schema.fields) {
      const normalized = normalizeFieldValue(
        field,
        recipient.values[field.name],
      );
      if (normalized.finding) findings.push(normalized.finding);
      if (!normalized.valid) {
        const behavior = normalized.present
          ? field.invalidBehavior
          : field.missingBehavior;
        if (behavior === "skip" || field.required) {
          skipped = true;
          skipReason = `${field.name}: ${normalized.finding?.message ?? "Invalid value"}`;
          continue;
        }
        if (behavior === "omit") continue;
      }
      if (normalized.value !== undefined) {
        normalizedValues[field.name] = normalized.value;
        previewValues[field.name] =
          field.sensitive && !request.includeSensitivePreview
            ? "[masked]"
            : normalized.value;
      }
    }

    const renderedPreview = renderTemplates(
      request.schema.templates,
      normalizedValues,
    );
    const maskedPreview = renderTemplates(
      request.schema.templates,
      previewValues,
    );
    const renderedConfigDigest = digest({
      schemaVersion: request.schema.version,
      recipientKey: recipient.recipientKey,
      values: normalizedValues,
      renderedPreview,
    });

    return {
      recipientKey: recipient.recipientKey,
      rowNumber: recipient.rowNumber ?? null,
      skipped,
      skipReason,
      findings,
      values: normalizedValues,
      renderedPreview,
      maskedPreview,
      renderedConfigDigest,
    };
  });

  const selectedRecipients = rows.length;
  const skippedRecipients = rows.filter((row) => row.skipped).length;
  return {
    schemaVersion: request.schema.version,
    selectedRecipients,
    validRecipients: selectedRecipients - skippedRecipients,
    skippedRecipients,
    fields: request.schema.fields.map((field) => {
      const presentCount = request.recipients.filter(
        (recipient) =>
          recipient.values[field.name] !== undefined &&
          recipient.values[field.name] !== null &&
          recipient.values[field.name] !== "",
      ).length;
      const invalidCount = rows.filter((row) =>
        row.findings.some(
          (finding) =>
            finding.field === field.name && finding.severity === "error",
        ),
      ).length;
      return {
        name: field.name,
        type: field.type,
        source: field.source,
        sensitive: field.sensitive,
        required: field.required,
        presentCount,
        missingCount: selectedRecipients - presentCount,
        invalidCount,
        coverage:
          selectedRecipients === 0 ? 0 : presentCount / selectedRecipients,
        missingBehavior: field.missingBehavior,
        invalidBehavior: field.invalidBehavior,
      };
    }),
    rows,
    dataQualityWarnings: buildDataQualityWarnings(rows),
  };
}

export function renderTemplates(
  templates: Record<string, string>,
  values: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(templates).map(([key, template]) => [
      key,
      renderTemplate(template, values),
    ]),
  );
}

export function renderTemplate(
  template: string,
  values: Record<string, unknown>,
) {
  return template.replace(TOKEN_RE, (match, key: string) => {
    if (!(key in values)) return match;
    return safePromptData(values[key]);
  });
}

export function assignExperimentVariants(request: CampaignAssignmentRequest) {
  const variants = [...request.experiment.variants];
  const orderedVariants = variants.map((variant, index) => ({
    ...variant,
    index,
  }));
  const assignments = request.unitKeys.map((unitKey) => {
    const exclusionReason = request.excludedUnitKeys[unitKey];
    if (exclusionReason) {
      const control =
        orderedVariants.find((variant) => variant.isControl) ??
        orderedVariants[0]!;
      return {
        unitKey,
        variantKey: control.key,
        assignmentHash: assignmentHash(request.experiment, unitKey),
        bucket: null,
        excluded: true,
        exclusionReason,
      };
    }
    const hash = assignmentHash(request.experiment, unitKey);
    const bucket = Number.parseInt(hash.slice(0, 8), 16) % 10_000;
    let cursor = 0;
    for (const variant of orderedVariants) {
      cursor += variant.allocationBps;
      if (bucket < cursor) {
        return {
          unitKey,
          variantKey: variant.key,
          assignmentHash: hash,
          bucket,
          excluded: false,
          exclusionReason: null,
        };
      }
    }
    const fallback = orderedVariants[orderedVariants.length - 1]!;
    return {
      unitKey,
      variantKey: fallback.key,
      assignmentHash: hash,
      bucket,
      excluded: false,
      exclusionReason: null,
    };
  });

  return {
    experimentId: request.experiment.experimentId,
    version: request.experiment.version,
    unit: request.experiment.unit,
    assignments,
    balance: variantBalance(request.experiment, assignments),
  };
}

export function validateConversionEvent(
  event: CampaignConversionEventInput,
  seenDedupeKeys: Set<string> = new Set(),
) {
  const findings: Finding[] = [];
  if (seenDedupeKeys.has(event.dedupeKey)) {
    findings.push({
      code: "DUPLICATE_CONVERSION",
      severity: "error",
      message: "Conversion dedupeKey was already ingested",
    });
  }
  if (event.valueCents !== undefined && !event.currency) {
    findings.push({
      code: "MISSING_CURRENCY",
      severity: "error",
      message: "Currency is required when valueCents is provided",
    });
  }
  if (event.occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    findings.push({
      code: "FUTURE_CONVERSION",
      severity: "error",
      message: "Conversion timestamp cannot be in the future",
    });
  }
  return {
    accepted: !findings.some((finding) => finding.severity === "error"),
    canonical: {
      ...event,
      currency: event.currency?.toUpperCase(),
      occurredAt: event.occurredAt.toISOString(),
    },
    findings,
  };
}

export function buildCampaignReport(request: CampaignReportRequest) {
  const buckets = new Map<
    string,
    {
      audience: Set<string>;
      attempts: number;
      connects: number;
      outcomes: Record<string, number>;
      conversions: number;
      conversionValueCents: number;
      costCents: number;
    }
  >();
  const bucketFor = (variantKey: string) => {
    if (!buckets.has(variantKey))
      buckets.set(variantKey, {
        audience: new Set(),
        attempts: 0,
        connects: 0,
        outcomes: {},
        conversions: 0,
        conversionValueCents: 0,
        costCents: 0,
      });
    return buckets.get(variantKey)!;
  };

  for (const attempt of request.attempts) {
    const bucket = bucketFor(attempt.variantKey ?? "unassigned");
    bucket.audience.add(attempt.unitKey);
    bucket.attempts += 1;
    if (attempt.connected) bucket.connects += 1;
    if (attempt.outcome)
      bucket.outcomes[attempt.outcome] =
        (bucket.outcomes[attempt.outcome] ?? 0) + 1;
    bucket.costCents += attempt.costCents;
  }
  for (const conversion of request.conversions) {
    const bucket = bucketFor(conversion.variantKey ?? "unassigned");
    bucket.audience.add(conversion.unitKey);
    bucket.conversions += 1;
    bucket.conversionValueCents += conversion.valueCents;
  }

  const variants = [...buckets.entries()].map(([variantKey, bucket]) => {
    const audience = bucket.audience.size;
    const conversionRate = audience ? bucket.conversions / audience : 0;
    return {
      variantKey,
      audience,
      attempts: bucket.attempts,
      connects: bucket.connects,
      connectRate: rate(bucket.connects, bucket.attempts),
      outcomes: bucket.outcomes,
      conversions: bucket.conversions,
      conversionRate,
      conversionValueCents: bucket.conversionValueCents,
      costCents: bucket.costCents,
      costPerConversionCents: bucket.conversions
        ? Math.round(bucket.costCents / bucket.conversions)
        : null,
      confidenceInterval: wilsonInterval(bucket.conversions, audience),
    };
  });

  return {
    evidenceLabel: request.randomized
      ? "randomized_with_uncertainty"
      : "observational_not_causal",
    causalClaimAllowed: false,
    dataFreshnessAt: new Date().toISOString(),
    variants,
    totals: variants.reduce(
      (total, variant) => ({
        audience: total.audience + variant.audience,
        attempts: total.attempts + variant.attempts,
        connects: total.connects + variant.connects,
        conversions: total.conversions + variant.conversions,
        conversionValueCents:
          total.conversionValueCents + variant.conversionValueCents,
        costCents: total.costCents + variant.costCents,
      }),
      {
        audience: 0,
        attempts: 0,
        connects: 0,
        conversions: 0,
        conversionValueCents: 0,
        costCents: 0,
      },
    ),
  };
}

type Field = CampaignPersonalizationSchemaInput["fields"][number];

function normalizeFieldValue(field: Field, raw: unknown): NormalizedValue {
  const hasValue = raw !== undefined && raw !== null && raw !== "";
  if (!hasValue) {
    if (
      field.defaultValue !== undefined &&
      field.missingBehavior === "fallback"
    ) {
      const fallback = normalizeFieldValue(
        { ...field, missingBehavior: "skip" },
        field.defaultValue,
      );
      return fallback.valid
        ? {
            ...fallback,
            finding: {
              field: field.name,
              code: "FALLBACK_USED",
              severity: "warning",
              message: "Missing value used the configured fallback",
            },
          }
        : fallback;
    }
    return {
      present: false,
      valid: false,
      finding: {
        field: field.name,
        code: "MISSING_VALUE",
        severity: field.required ? "error" : "warning",
        message: "Value is missing",
      },
    };
  }

  const text = typeof raw === "string" ? raw.trim() : raw;
  let value: string | number | boolean;
  if (field.type === "number") {
    const parsed = typeof text === "number" ? text : Number(text);
    if (!Number.isFinite(parsed))
      return invalidField(field, "INVALID_NUMBER", "Value must be a number");
    value = parsed;
  } else if (field.type === "boolean") {
    if (typeof text === "boolean") value = text;
    else if (["true", "1", "yes"].includes(String(text).toLowerCase()))
      value = true;
    else if (["false", "0", "no"].includes(String(text).toLowerCase()))
      value = false;
    else return invalidField(field, "INVALID_BOOLEAN", "Value must be boolean");
  } else if (field.type === "date") {
    const parsed = new Date(String(text));
    if (Number.isNaN(parsed.getTime()))
      return invalidField(field, "INVALID_DATE", "Value must be a valid date");
    value = parsed.toISOString();
  } else {
    value = String(text);
  }

  if (typeof value === "string") {
    if (value.length > field.maxLength)
      return invalidField(
        field,
        "VALUE_TOO_LONG",
        `Value exceeds ${field.maxLength} characters`,
      );
    value = safePromptData(value);
  }
  if (field.type === "enum" && !field.allowedValues?.includes(String(value))) {
    return invalidField(field, "INVALID_ENUM", "Value is not in allowedValues");
  }
  return { present: true, valid: true, value, display: String(value) };
}

function invalidField(
  field: Field,
  code: string,
  message: string,
): NormalizedValue {
  if (
    field.defaultValue !== undefined &&
    field.invalidBehavior === "fallback"
  ) {
    const fallback = normalizeFieldValue(
      { ...field, invalidBehavior: "skip" },
      field.defaultValue,
    );
    return fallback.valid
      ? {
          ...fallback,
          finding: {
            field: field.name,
            code: "FALLBACK_USED",
            severity: "warning",
            message: `${message}; used the configured fallback`,
          },
        }
      : fallback;
  }
  return {
    present: true,
    valid: false,
    finding: { field: field.name, code, severity: "error", message },
  };
}

function safePromptData(value: unknown) {
  return String(value)
    .replace(CONTROL_CHARS_RE, " ")
    .replaceAll("{{", "｛｛")
    .replaceAll("}}", "｝｝")
    .trim();
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assignmentHash(
  experiment: CampaignExperimentDefinition,
  unitKey: string,
) {
  return createHash("sha256")
    .update(
      `${experiment.experimentId}:${experiment.version}:${experiment.unit}:${unitKey}`,
    )
    .digest("hex");
}

function variantBalance(
  experiment: CampaignExperimentDefinition,
  assignments: Array<{ variantKey: string; excluded: boolean }>,
) {
  const eligible = assignments.filter((assignment) => !assignment.excluded);
  return experiment.variants.map((variant) => {
    const assigned = eligible.filter(
      (assignment) => assignment.variantKey === variant.key,
    ).length;
    const observedBps = eligible.length
      ? Math.round((assigned / eligible.length) * 10_000)
      : 0;
    return {
      variantKey: variant.key,
      expectedBps: variant.allocationBps,
      observedBps,
      assigned,
      imbalanceBps: observedBps - variant.allocationBps,
      warning:
        eligible.length >= 100 &&
        Math.abs(observedBps - variant.allocationBps) > 750
          ? "Sample ratio mismatch risk"
          : null,
    };
  });
}

function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function wilsonInterval(successes: number, total: number) {
  if (!total) return { low: 0, high: 0 };
  const z = 1.96;
  const phat = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (phat + (z * z) / (2 * total)) / denom;
  const spread =
    (z *
      Math.sqrt((phat * (1 - phat)) / total + (z * z) / (4 * total * total))) /
    denom;
  return {
    low: Math.max(0, center - spread),
    high: Math.min(1, center + spread),
  };
}

function buildDataQualityWarnings(
  rows: Array<{ skipped: boolean; findings: Finding[] }>,
) {
  const warnings = new Set<string>();
  if (rows.some((row) => row.skipped))
    warnings.add(
      "Some recipients will be skipped by configured missing/invalid behavior.",
    );
  if (
    rows.some((row) =>
      row.findings.some((finding) => finding.code === "MISSING_VALUE"),
    )
  )
    warnings.add("One or more fields have missing values.");
  if (
    rows.some((row) =>
      row.findings.some((finding) => finding.code.startsWith("INVALID")),
    )
  )
    warnings.add("One or more fields have invalid values.");
  return [...warnings];
}
