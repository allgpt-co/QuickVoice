import { createHash } from "node:crypto";

export type McpCapabilityRisk = "read" | "write" | "communication" | "financial" | "customer_record" | "destructive" | "unknown";
export type McpApprovalMode = "auto" | "human_required" | "deny";
export type McpTrustStatus = "verified" | "unreviewed" | "schema_changed" | "revoked";

export type McpCapabilityPolicy = {
  organizationId: string;
  environmentId?: string;
  agentId?: string;
  allowedScopes: string[];
  riskApprovals: Record<McpCapabilityRisk, McpApprovalMode>;
  maxPayloadBytes: number;
  timeoutMs: number;
  allowRetriesForIdempotent: boolean;
};

export type McpInvocationRequest = {
  organizationId: string;
  environmentId?: string;
  agentId?: string;
  serverId: string;
  toolName: string;
  risk: McpCapabilityRisk;
  scopes: string[];
  arguments: Record<string, unknown>;
  idempotencyKey?: string;
  approval?: { approvalId: string; actorId: string; requestHash: string; expiresAt: string; usedAt?: string };
  requestedBy: "model" | "human" | "system";
};

export type McpSchemaSnapshot = {
  serverId: string;
  protocolVersion: string;
  fetchedAt: string;
  schema: unknown;
  contentHash: string;
  trustStatus: McpTrustStatus;
};

const SENSITIVE_ARGUMENT_KEY = /secret|token|password|authorization|api[-_]?key|phone|email|transcript|recording/i;

export function buildMcpSchemaSnapshot(args: Omit<McpSchemaSnapshot, "contentHash" | "trustStatus"> & { previousHash?: string }): McpSchemaSnapshot {
  const contentHash = createHash("sha256").update(stableStringify(args.schema)).digest("hex");
  return {
    serverId: args.serverId,
    protocolVersion: args.protocolVersion,
    fetchedAt: args.fetchedAt,
    schema: args.schema,
    contentHash,
    trustStatus: args.previousHash && args.previousHash !== contentHash ? "schema_changed" : "unreviewed",
  };
}

export function evaluateMcpInvocation(policy: McpCapabilityPolicy, request: McpInvocationRequest, now = new Date()) {
  const reasons: string[] = [];
  if (request.organizationId !== policy.organizationId) reasons.push("organization mismatch");
  if (policy.environmentId && request.environmentId !== policy.environmentId) reasons.push("environment mismatch");
  if (policy.agentId && request.agentId !== policy.agentId) reasons.push("agent mismatch");
  for (const scope of request.scopes) if (!policy.allowedScopes.includes(scope)) reasons.push(`scope not granted: ${scope}`);
  if (byteLength(request.arguments) > policy.maxPayloadBytes) reasons.push("payload exceeds policy limit");
  const mode = policy.riskApprovals[request.risk] ?? "deny";
  if (mode === "deny") reasons.push(`risk denied: ${request.risk}`);
  if (mode === "human_required") {
    const requestHash = hashInvocation(request);
    if (!request.approval) reasons.push("human approval is required");
    else if (request.requestedBy === "model") reasons.push("model cannot self-approve");
    else if (request.approval.usedAt) reasons.push("approval token already used");
    else if (new Date(request.approval.expiresAt) <= now) reasons.push("approval token expired");
    else if (request.approval.requestHash !== requestHash) reasons.push("approval token is not bound to this request");
  }
  return { allowed: reasons.length === 0, reasons, sanitizedArguments: sanitizeArguments(request.arguments) };
}

export function shouldRetryMcpInvocation(args: { risk: McpCapabilityRisk; idempotent: boolean; idempotencyKey?: string; status?: number; timedOut?: boolean; policy: McpCapabilityPolicy }) {
  if (!args.policy.allowRetriesForIdempotent) return { retry: false, reason: "retries_disabled" as const };
  if (!args.idempotent || !args.idempotencyKey) return { retry: false, reason: "not_idempotent" as const };
  if (["destructive", "unknown"].includes(args.risk)) return { retry: false, reason: "risk_not_retryable" as const };
  if (args.timedOut || args.status === 429 || (args.status !== undefined && args.status >= 500)) return { retry: true, reason: "retryable" as const };
  return { retry: false, reason: "not_retryable" as const };
}

export function hashInvocation(request: Pick<McpInvocationRequest, "organizationId" | "environmentId" | "agentId" | "serverId" | "toolName" | "risk" | "scopes" | "arguments">) {
  return createHash("sha256").update(stableStringify({ organizationId: request.organizationId, environmentId: request.environmentId, agentId: request.agentId, serverId: request.serverId, toolName: request.toolName, risk: request.risk, scopes: [...request.scopes].sort(), arguments: sanitizeArguments(request.arguments) })).digest("hex");
}

function sanitizeArguments(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => {
    if (SENSITIVE_ARGUMENT_KEY.test(key)) return [key, "[redacted]"];
    if (value && typeof value === "object" && !Array.isArray(value)) return [key, sanitizeArguments(value as Record<string, unknown>)];
    return [key, value];
  }));
}

function byteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value) ?? "undefined");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
