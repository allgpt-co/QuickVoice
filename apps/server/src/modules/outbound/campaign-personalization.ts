import { createHash } from "node:crypto";

export type CampaignVariableType = "string" | "number" | "boolean" | "date" | "enum";
export type VariableMissingBehavior = "fallback" | "omit" | "skip_recipient" | "workflow_edge";
export type VariableSource = "customer_attribute" | "audience_snapshot" | "campaign_constant" | "computed_safe" | "connector_lookup";
export type AttributionModel = "first_touch" | "last_touch" | "linear" | "position_based" | "observed_after_interaction";

export type CampaignVariableDefinition = {
  name: string;
  type: CampaignVariableType;
  source: VariableSource;
  required: boolean;
  sensitive: boolean;
  maxLength?: number;
  allowedValues?: string[];
  defaultValue?: string | number | boolean;
  missingBehavior: VariableMissingBehavior;
};

export type RenderFinding = { variable: string; severity: "error" | "warning"; reason: string };
export type ExperimentVariant = { variantId: string; allocationPercent: number; versionRef: string };
export type ConversionEvent = { goalKey: string; customerId: string; dedupeKey: string; occurredAt: string; valueCents?: number; currency?: string; sourceTrusted: boolean };
export type Touchpoint = { touchId: string; customerId: string; occurredAt: string; variantId?: string };

const TEMPLATE_TOKEN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
const PROMPT_INJECTION_PATTERN = /ignore previous|system prompt|developer message|tool call|<script|javascript:/i;

export function validateCampaignVariables(definitions: CampaignVariableDefinition[], values: Record<string, unknown>) {
  const findings: RenderFinding[] = [];
  for (const definition of definitions) {
    const value = values[definition.name] ?? definition.defaultValue;
    if (value === undefined || value === null || value === "") {
      if (definition.required && definition.missingBehavior === "skip_recipient") findings.push({ variable: definition.name, severity: "error", reason: "required value missing; recipient must be skipped" });
      else if (definition.required) findings.push({ variable: definition.name, severity: "error", reason: "required value missing" });
      continue;
    }
    if (!matchesVariableType(definition, value)) findings.push({ variable: definition.name, severity: "error", reason: `expected ${definition.type}` });
    if (definition.allowedValues && !definition.allowedValues.includes(String(value))) findings.push({ variable: definition.name, severity: "error", reason: "value not allowed" });
    if (definition.maxLength && String(value).length > definition.maxLength) findings.push({ variable: definition.name, severity: "error", reason: "value exceeds max length" });
    if (definition.sensitive) findings.push({ variable: definition.name, severity: "warning", reason: "sensitive value requires permissioned destination" });
    if (typeof value === "string" && PROMPT_INJECTION_PATTERN.test(value)) findings.push({ variable: definition.name, severity: "warning", reason: "recipient text contains instruction-like content" });
  }
  return findings;
}

export function renderPersonalizedTemplate(template: string, definitions: CampaignVariableDefinition[], values: Record<string, unknown>) {
  const definitionsByName = new Map(definitions.map((definition) => [definition.name, definition]));
  const findings = validateCampaignVariables(definitions, values);
  const rendered = template.replace(TEMPLATE_TOKEN, (_match, name: string) => {
    const definition = definitionsByName.get(name);
    if (!definition) {
      findings.push({ variable: name, severity: "error", reason: "unknown variable" });
      return "";
    }
    const value = values[name] ?? definition.defaultValue;
    if (value === undefined || value === null || value === "") return definition.missingBehavior === "fallback" ? escapeForPrompt(String(definition.defaultValue ?? "")) : "";
    return escapeForPrompt(String(value)).slice(0, definition.maxLength ?? 500);
  });
  return { rendered, findings, digest: createHash("sha256").update(rendered).digest("hex") };
}

export function assignCampaignVariant(args: { experimentId: string; unitId: string; variants: ExperimentVariant[]; holdoutPercent?: number }) {
  const total = args.variants.reduce((sum, variant) => sum + variant.allocationPercent, args.holdoutPercent ?? 0);
  if (total > 100) throw new Error("allocation cannot exceed 100%");
  const bucket = deterministicPercent(`${args.experimentId}:${args.unitId}`);
  if (bucket < (args.holdoutPercent ?? 0)) return { bucket, variantId: "holdout", versionRef: null };
  let cursor = args.holdoutPercent ?? 0;
  for (const variant of args.variants) {
    cursor += variant.allocationPercent;
    if (bucket < cursor) return { bucket, variantId: variant.variantId, versionRef: variant.versionRef };
  }
  return { bucket, variantId: "unassigned", versionRef: null };
}

export function ingestConversionEvent(event: ConversionEvent, seenDedupeKeys: Set<string>) {
  if (!event.sourceTrusted) return { accepted: false, reason: "untrusted_source" as const };
  if (seenDedupeKeys.has(event.dedupeKey)) return { accepted: false, reason: "duplicate" as const };
  if (event.valueCents !== undefined && (!event.currency || event.valueCents < 0)) return { accepted: false, reason: "invalid_value" as const };
  return { accepted: true, reason: "accepted" as const, eventId: `conv_${createHash("sha256").update(`${event.goalKey}:${event.customerId}:${event.dedupeKey}`).digest("hex").slice(0, 16)}` };
}

export function attributeConversion(args: { conversion: ConversionEvent; touchpoints: Touchpoint[]; model: AttributionModel; lookbackDays: number }) {
  const conversionTime = new Date(args.conversion.occurredAt).getTime();
  const windowStart = conversionTime - args.lookbackDays * 24 * 60 * 60 * 1000;
  const eligible = args.touchpoints.filter((touch) => touch.customerId === args.conversion.customerId && new Date(touch.occurredAt).getTime() >= windowStart && new Date(touch.occurredAt).getTime() <= conversionTime).sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
  if (eligible.length === 0) return [];
  if (args.model === "first_touch") return [{ touchId: eligible[0]!.touchId, credit: 1 }];
  if (args.model === "last_touch" || args.model === "observed_after_interaction") return [{ touchId: eligible.at(-1)?.touchId ?? eligible[0]!.touchId, credit: 1 }];
  if (args.model === "linear") return eligible.map((touch) => ({ touchId: touch.touchId, credit: 1 / eligible.length }));
  if (eligible.length === 1) return [{ touchId: eligible[0]!.touchId, credit: 1 }];
  return eligible.map((touch, index) => ({ touchId: touch.touchId, credit: index === 0 || index === eligible.length - 1 ? 0.4 : 0.2 / (eligible.length - 2) }));
}

function matchesVariableType(definition: CampaignVariableDefinition, value: unknown) {
  if (definition.type === "enum") return typeof value === "string";
  if (definition.type === "date") return typeof value === "string" && !Number.isNaN(Date.parse(value));
  return typeof value === definition.type;
}

function escapeForPrompt(value: string) {
  return value.replace(/[{}<>]/g, (char) => ({ "{": "&#123;", "}": "&#125;", "<": "&lt;", ">": "&gt;" }[char] ?? char));
}

function deterministicPercent(seed: string) {
  return Math.floor((createHash("sha256").update(seed).digest().readUInt32BE(0) / 0xffffffff) * 10000) / 100;
}
