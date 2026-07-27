import { createHash } from "node:crypto";

export type ExportResourceType = "organization" | "agents" | "workflows" | "tools" | "knowledge" | "phones" | "contacts" | "campaigns" | "calls" | "recordings" | "transcripts" | "evaluations" | "analytics" | "audit" | "templates" | "billing";
export type ExportFormat = "jsonl" | "json" | "csv" | "parquet";
export type ImportConflictMode = "fail" | "skip" | "create_new" | "update_supported";

export type ExportSelection = {
  resourceTypes: ExportResourceType[];
  from?: string;
  to?: string;
  projectId?: string;
  environmentId?: string;
  dataClasses?: string[];
};

export type ExportArtifact = {
  path: string;
  resourceType: ExportResourceType;
  format: ExportFormat;
  recordCount: number;
  bytes: number;
  checksumSha256: string;
};

export type ExportManifest = {
  schemaVersion: "quickvoice.export.v1";
  exportId: string;
  organizationId: string;
  selection: ExportSelection;
  createdAt: string;
  watermark: string;
  consistencyModel: "watermark" | "best_effort";
  artifacts: ExportArtifact[];
  omissions: string[];
  encrypted: boolean;
  restoreCompatibility: { minSchemaVersion: number; maxSchemaVersion: number };
};

const SECRET_RESOURCE_TYPES = new Set<ExportResourceType>(["billing"]);
const UNSAFE_ARCHIVE_PATH = /(^|\/)\.\.($|\/)|\\|\0/;

export function buildExportManifest(args: Omit<ExportManifest, "schemaVersion">): ExportManifest {
  return { schemaVersion: "quickvoice.export.v1", ...args };
}

export function validateExportSelection(selection: ExportSelection) {
  const issues: string[] = [];
  if (selection.resourceTypes.length === 0) issues.push("at least one resource type must be selected");
  if (selection.from && selection.to && new Date(selection.from) > new Date(selection.to)) issues.push("from must be before to");
  for (const resourceType of selection.resourceTypes) if (SECRET_RESOURCE_TYPES.has(resourceType)) issues.push(`${resourceType} exports are metadata-only and require elevated approval`);
  return issues;
}

export function validateExportManifest(manifest: ExportManifest, currentSchemaVersion: number) {
  const issues: string[] = [];
  if (manifest.schemaVersion !== "quickvoice.export.v1") issues.push("unsupported export manifest schema");
  if (currentSchemaVersion < manifest.restoreCompatibility.minSchemaVersion || currentSchemaVersion > manifest.restoreCompatibility.maxSchemaVersion) issues.push("export is incompatible with current restore schema");
  if (!manifest.encrypted) issues.push("export artifacts must be encrypted");
  for (const artifact of manifest.artifacts) {
    if (UNSAFE_ARCHIVE_PATH.test(artifact.path)) issues.push(`unsafe artifact path ${artifact.path}`);
    if (!/^[a-f0-9]{64}$/.test(artifact.checksumSha256)) issues.push(`artifact ${artifact.path} has invalid checksum`);
  }
  return issues;
}

export function checksumExportRecord(record: unknown) {
  return createHash("sha256").update(stableStringify(record)).digest("hex");
}

export function planRestore(args: { manifest: ExportManifest; conflictModes: Partial<Record<ExportResourceType, ImportConflictMode>>; currentSchemaVersion: number }) {
  const manifestIssues = validateExportManifest(args.manifest, args.currentSchemaVersion);
  if (manifestIssues.length > 0) return { status: "blocked" as const, issues: manifestIssues, operations: [] };
  const operations = args.manifest.artifacts.map((artifact) => ({
    resourceType: artifact.resourceType,
    records: artifact.recordCount,
    conflictMode: args.conflictModes[artifact.resourceType] ?? "fail" as ImportConflictMode,
    destructive: args.conflictModes[artifact.resourceType] === "update_supported",
  }));
  return { status: operations.some((operation) => operation.destructive) ? "needs_confirmation" as const : "ready" as const, issues: [], operations };
}

export function updateIncrementalWatermark(previous: string | undefined, observed: string) {
  if (!previous) return observed;
  return new Date(observed) > new Date(previous) ? observed : previous;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
