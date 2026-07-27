import { createHash } from "node:crypto";

export type ConnectorAuthMethod = "oauth_pkce" | "service_account" | "api_key" | "secret_reference";
export type ConnectorCapability = "read" | "create_update" | "delete" | "communication" | "financial" | "administrative";
export type ConflictStrategy = "source_of_truth" | "last_write" | "merge" | "create_only" | "manual_review";
export type SchemaDriftKind = "added" | "removed" | "type_changed";

export type ConnectorDefinition = {
  connectorId: string;
  version: string;
  provider: string;
  authMethods: ConnectorAuthMethod[];
  capabilities: ConnectorCapability[];
  objects: Array<{ objectType: string; fields: Record<string, string>; supportsIncrementalSync: boolean; supportsWebhooks: boolean }>;
  requiredScopes: string[];
  rateLimitPerMinute?: number;
};

export type FieldMapping = {
  canonicalField: string;
  externalObjectType: string;
  externalField: string;
  strategy: ConflictStrategy;
  required?: boolean;
};

export type SyncCheckpoint = {
  connectionId: string;
  objectType: string;
  cursor?: string;
  highWatermark?: string;
  processedExternalIds: string[];
};

export function validateConnectorDefinition(definition: ConnectorDefinition): string[] {
  const issues: string[] = [];
  if (!definition.connectorId.trim()) issues.push("connectorId is required");
  if (definition.authMethods.length === 0) issues.push("at least one auth method is required");
  if (definition.capabilities.length === 0) issues.push("at least one capability is required");
  if (definition.objects.length === 0) issues.push("at least one object is required");
  if (definition.capabilities.includes("financial") && !definition.requiredScopes.some((scope) => scope.includes("read") || scope.includes("write"))) issues.push("financial connectors must declare explicit scopes");
  return issues;
}

export function snapshotConnectorSchema(definition: ConnectorDefinition) {
  return { connectorId: definition.connectorId, version: definition.version, contentHash: createHash("sha256").update(stableStringify(definition.objects)).digest("hex") };
}

export function diffConnectorSchemas(previous: ConnectorDefinition, next: ConnectorDefinition) {
  const diffs: Array<{ objectType: string; field: string; kind: SchemaDriftKind; previousType?: string; nextType?: string }> = [];
  const previousObjects = toObjectMap(previous);
  const nextObjects = toObjectMap(next);
  for (const [objectType, previousFields] of previousObjects) {
    const nextFields = nextObjects.get(objectType) ?? new Map<string, string>();
    for (const [field, previousType] of previousFields) {
      if (!nextFields.has(field)) diffs.push({ objectType, field, kind: "removed", previousType });
      else if (nextFields.get(field) !== previousType) diffs.push({ objectType, field, kind: "type_changed", previousType, nextType: nextFields.get(field) });
    }
  }
  for (const [objectType, nextFields] of nextObjects) {
    const previousFields = previousObjects.get(objectType) ?? new Map<string, string>();
    for (const [field, nextType] of nextFields) if (!previousFields.has(field)) diffs.push({ objectType, field, kind: "added", nextType });
  }
  return diffs.sort((left, right) => `${left.objectType}.${left.field}`.localeCompare(`${right.objectType}.${right.field}`));
}

export function validateFieldMappings(definition: ConnectorDefinition, mappings: FieldMapping[]) {
  const issues: string[] = [];
  for (const mapping of mappings) {
    const object = definition.objects.find((item) => item.objectType === mapping.externalObjectType);
    if (!object) issues.push(`${mapping.canonicalField} maps to unknown object ${mapping.externalObjectType}`);
    else if (!object.fields[mapping.externalField]) issues.push(`${mapping.canonicalField} maps to unknown field ${mapping.externalField}`);
    if (["delete", "financial", "administrative"].some((risk) => mapping.canonicalField.includes(risk)) && mapping.strategy !== "manual_review") issues.push(`${mapping.canonicalField} requires manual review strategy`);
  }
  return issues;
}

export function shouldPauseMappingsForDrift(drift: ReturnType<typeof diffConnectorSchemas>, mappings: FieldMapping[]) {
  const impacted = new Set(drift.filter((item) => item.kind !== "added").map((item) => `${item.objectType}.${item.field}`));
  return mappings.filter((mapping) => impacted.has(`${mapping.externalObjectType}.${mapping.externalField}`));
}

export function updateSyncCheckpoint(checkpoint: SyncCheckpoint, batch: { cursor?: string; highWatermark?: string; externalIds: string[] }) {
  return {
    ...checkpoint,
    cursor: batch.cursor ?? checkpoint.cursor,
    highWatermark: batch.highWatermark ?? checkpoint.highWatermark,
    processedExternalIds: [...new Set([...checkpoint.processedExternalIds, ...batch.externalIds])].sort(),
  };
}

export function shouldRetryConnectorOperation(args: { capability: ConnectorCapability; idempotent: boolean; status?: number; attempt: number; maxAttempts: number }) {
  if (args.attempt >= args.maxAttempts) return { retry: false, reason: "max_attempts" as const };
  if (["delete", "financial", "administrative"].includes(args.capability) && !args.idempotent) return { retry: false, reason: "high_risk_not_idempotent" as const };
  if (args.status === 429 || (args.status !== undefined && args.status >= 500)) return { retry: true, reason: "retryable_provider_response" as const };
  return { retry: false, reason: "not_retryable" as const };
}

function toObjectMap(definition: ConnectorDefinition) {
  return new Map(definition.objects.map((object) => [object.objectType, new Map(Object.entries(object.fields))]));
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
