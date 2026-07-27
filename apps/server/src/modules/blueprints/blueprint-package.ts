import { createHash } from "node:crypto";

export type BlueprintResourceKind = "agent" | "workflow" | "tool" | "knowledge" | "variable" | "evaluation" | "campaign" | "dashboard" | "widget" | "documentation";
export type BlueprintTrustStatus = "verified" | "unsigned" | "modified" | "revoked";

export type BlueprintResource = {
  logicalKey: string;
  kind: BlueprintResourceKind;
  digest: string;
  content: Record<string, unknown>;
  dependsOn?: string[];
};

export type BlueprintPackage = {
  schemaVersion: "quickvoice.blueprint.v1";
  blueprintId: string;
  publisher: string;
  exportedAt: string;
  compatibility: { minSchemaVersion: number; maxSchemaVersion: number };
  license: string;
  resources: BlueprintResource[];
  requiredCapabilities: string[];
  requiredProviders: string[];
  requiredPermissions: string[];
  setupInstructions: string[];
  changelog: string;
  signature?: { signerId: string; digest: string; revokedAt?: string };
};

export type BlueprintShareGrant = {
  grantId: string;
  organizationId: string;
  blueprintDigest: string;
  expiresAt: string;
  revokedAt?: string;
  recipientDomains?: string[];
  permissions: Array<"download" | "install">;
};

const FORBIDDEN_CONTENT = /secret|token|password|authorization|credential|contact|recipient|callLog|recording|transcript|audit|billing|liveAssignment|phoneOwnership/i;
const UNSAFE_PATH = /(^|\/)\.\.($|\/)|\\|\0/;
const UNSAFE_URL = /^(?!https:\/\/)[a-z][a-z0-9+.-]*:\/\//i;

export function digestBlueprintPackage(pkg: BlueprintPackage) {
  return createHash("sha256").update(stableStringify({ ...pkg, signature: undefined })).digest("hex");
}

export function validateBlueprintPackage(pkg: BlueprintPackage, currentSchemaVersion: number): string[] {
  const issues: string[] = [];
  if (pkg.schemaVersion !== "quickvoice.blueprint.v1") issues.push("unsupported blueprint schema version");
  if (currentSchemaVersion < pkg.compatibility.minSchemaVersion || currentSchemaVersion > pkg.compatibility.maxSchemaVersion) issues.push("blueprint is incompatible with current schema version");
  if (pkg.resources.length === 0) issues.push("blueprint must include at least one logical resource");
  const keys = new Set<string>();
  for (const resource of pkg.resources) {
    if (keys.has(resource.logicalKey)) issues.push(`duplicate logical resource key ${resource.logicalKey}`);
    keys.add(resource.logicalKey);
    if (UNSAFE_PATH.test(resource.logicalKey)) issues.push(`unsafe logical resource key ${resource.logicalKey}`);
    scanContent(resource.logicalKey, resource.content, issues);
    for (const dependency of resource.dependsOn ?? []) if (!keys.has(dependency) && !pkg.resources.some((candidate) => candidate.logicalKey === dependency)) issues.push(`${resource.logicalKey} references missing dependency ${dependency}`);
  }
  return issues;
}

export function verifyBlueprintTrust(pkg: BlueprintPackage, revokedSignerIds: string[] = []): BlueprintTrustStatus {
  if (!pkg.signature) return "unsigned";
  if (pkg.signature.revokedAt || revokedSignerIds.includes(pkg.signature.signerId)) return "revoked";
  return pkg.signature.digest === digestBlueprintPackage(pkg) ? "verified" : "modified";
}

export function buildBlueprintImportDryRun(args: { organizationId: string; pkg: BlueprintPackage; selectedMappings?: Record<string, string>; idempotencyKey: string }) {
  if (!args.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  const digest = digestBlueprintPackage(args.pkg);
  return {
    importJobId: `bpimp_${createHash("sha256").update(`${args.organizationId}:${digest}:${args.idempotencyKey}`).digest("hex").slice(0, 16)}`,
    organizationId: args.organizationId,
    blueprintDigest: digest,
    inventory: args.pkg.resources.map((resource) => ({ logicalKey: resource.logicalKey, kind: resource.kind, mappedTo: args.selectedMappings?.[resource.logicalKey] ?? null, action: args.selectedMappings?.[resource.logicalKey] ? "reuse" as const : "create_draft" as const })),
    billableSideEffects: false as const,
    createsLiveAssignments: false as const,
  };
}

export function evaluateShareGrantAccess(grant: BlueprintShareGrant, request: { organizationId: string; recipientEmail?: string; permission: "download" | "install"; now: string }) {
  if (grant.organizationId !== request.organizationId) return { allowed: false, reason: "wrong_organization" as const };
  if (grant.revokedAt) return { allowed: false, reason: "revoked" as const };
  if (new Date(grant.expiresAt) <= new Date(request.now)) return { allowed: false, reason: "expired" as const };
  if (!grant.permissions.includes(request.permission)) return { allowed: false, reason: "permission_denied" as const };
  const domain = request.recipientEmail?.split("@")[1]?.toLowerCase();
  if (grant.recipientDomains?.length && (!domain || !grant.recipientDomains.includes(domain))) return { allowed: false, reason: "recipient_domain_denied" as const };
  return { allowed: true, reason: "allowed" as const };
}

function scanContent(path: string, value: unknown, issues: string[]) {
  if (FORBIDDEN_CONTENT.test(path)) issues.push(`blueprint content contains forbidden field ${path}`);
  if (typeof value === "string" && UNSAFE_URL.test(value)) issues.push(`blueprint content contains unsafe URL at ${path}`);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) scanContent(`${path}.${key}`, child, issues);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
