import { createHash } from "node:crypto";

export type TemplateLifecycleStatus = "draft" | "review" | "published" | "deprecated" | "withdrawn";
export type TemplateSupportLevel = "community" | "verified" | "official";
export type TemplateResourceKind = "agent" | "workflow" | "tool" | "knowledge_placeholder" | "variable" | "evaluation" | "campaign_default" | "dashboard_default";
export type TemplateDiffDecision = "accept_update" | "keep_local" | "manual_conflict";

export type TemplatePackageResource = {
  logicalKey: string;
  kind: TemplateResourceKind;
  content: Record<string, unknown>;
};

export type TemplateVersion = {
  templateId: string;
  versionId: string;
  version: string;
  status: TemplateLifecycleStatus;
  publisher: string;
  supportLevel: TemplateSupportLevel;
  industries: string[];
  useCases: string[];
  locales: string[];
  channels: string[];
  requiredProviders: string[];
  requiredPermissions: string[];
  compatibility: { minSchemaVersion: number; maxSchemaVersion: number };
  changelog: string;
  license: string;
  package: { resources: TemplatePackageResource[]; setupSteps: string[]; warnings: string[]; sampleData?: unknown };
};

export type TemplateInstallationPlan = {
  installationId: string;
  organizationId: string;
  templateId: string;
  versionId: string;
  contentDigest: string;
  creates: Array<{ logicalKey: string; kind: TemplateResourceKind; organizationOwned: true }>;
  billableSideEffects: false;
};

export type BaselineField = {
  path: string;
  value: unknown;
};

const SECRET_OR_CUSTOMER_FIELD = /secret|token|password|authorization|apiKey|credential|customer|contact|transcript|recording|phone|email/i;
const UNSAFE_URL = /^(?!https:\/\/)[a-z][a-z0-9+.-]*:\/\//i;

export function listDiscoverableTemplateVersions(versions: TemplateVersion[]) {
  return versions.filter((version) => version.status === "published").sort((left, right) => left.templateId.localeCompare(right.templateId) || right.version.localeCompare(left.version));
}

export function validateTemplateVersion(version: TemplateVersion, currentSchemaVersion: number): string[] {
  const issues: string[] = [];
  if (version.status === "published" && !["verified", "official"].includes(version.supportLevel)) issues.push("published templates must be verified or official");
  if (currentSchemaVersion < version.compatibility.minSchemaVersion || currentSchemaVersion > version.compatibility.maxSchemaVersion) issues.push("template is incompatible with current schema version");
  if (version.package.resources.length === 0) issues.push("template package must include at least one resource");

  for (const resource of version.package.resources) {
    if (!resource.logicalKey.trim()) issues.push("template resource logicalKey is required");
    scanUnsafeContent(resource.logicalKey, resource.content, issues);
  }

  return issues;
}

export function digestTemplateVersion(version: TemplateVersion) {
  return createHash("sha256").update(stableStringify({ ...version, status: undefined })).digest("hex");
}

export function buildTemplateInstallationPlan(args: { organizationId: string; version: TemplateVersion; idempotencyKey: string }): TemplateInstallationPlan {
  if (!args.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  return {
    installationId: `tplinst_${createHash("sha256").update(`${args.organizationId}:${args.version.versionId}:${args.idempotencyKey}`).digest("hex").slice(0, 16)}`,
    organizationId: args.organizationId,
    templateId: args.version.templateId,
    versionId: args.version.versionId,
    contentDigest: digestTemplateVersion(args.version),
    creates: args.version.package.resources.map((resource) => ({ logicalKey: resource.logicalKey, kind: resource.kind, organizationOwned: true })),
    billableSideEffects: false,
  };
}

export function threeWayTemplateDiff(args: { baseline: BaselineField[]; local: BaselineField[]; proposed: BaselineField[] }) {
  const baseline = toMap(args.baseline);
  const local = toMap(args.local);
  const proposed = toMap(args.proposed);
  const paths = [...new Set([...baseline.keys(), ...local.keys(), ...proposed.keys()])].sort();

  return paths.map((path) => {
    const baseValue = baseline.get(path);
    const localValue = local.get(path);
    const proposedValue = proposed.get(path);
    const localChanged = stableStringify(baseValue) !== stableStringify(localValue);
    const proposedChanged = stableStringify(baseValue) !== stableStringify(proposedValue);
    let decision: TemplateDiffDecision = "keep_local";
    if (proposedChanged && !localChanged) decision = "accept_update";
    if (proposedChanged && localChanged && stableStringify(localValue) !== stableStringify(proposedValue)) decision = "manual_conflict";
    return { path, baseline: baseValue, local: localValue, proposed: proposedValue, localChanged, proposedChanged, decision };
  });
}

function scanUnsafeContent(path: string, value: unknown, issues: string[]) {
  if (SECRET_OR_CUSTOMER_FIELD.test(path)) issues.push(`template content contains forbidden field ${path}`);
  if (typeof value === "string" && UNSAFE_URL.test(value)) issues.push(`template content contains unsafe URL at ${path}`);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) scanUnsafeContent(`${path}.${key}`, child, issues);
}

function toMap(fields: BaselineField[]) {
  return new Map(fields.map((field) => [field.path, field.value]));
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
