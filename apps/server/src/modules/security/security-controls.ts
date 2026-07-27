import { createHash } from "node:crypto";

export type AuditCategory = "identity" | "agent" | "workflow" | "tool" | "mcp" | "secret" | "key" | "telephony" | "campaign" | "data" | "policy" | "eval" | "provider" | "approval" | "billing" | "admin" | "incident";
export type SecurityRiskDecision = "allow" | "confirm" | "approve" | "deny" | "redact" | "handoff" | "end";
export type SecretVersionState = "created" | "active" | "rotating" | "expired" | "revoked";

export type CanonicalAuditEvent = {
  eventId: string;
  category: AuditCategory;
  organizationId: string;
  actor: { type: "user" | "service_account" | "worker" | "system"; id: string };
  action: string;
  resource: { type: string; id: string; version?: string };
  result: "success" | "failure" | "denied";
  reasonCode?: string;
  source: "console" | "api" | "worker" | "realtime" | "mcp" | "job";
  correlationId: string;
  occurredAt: string;
  diff?: Record<string, unknown>;
};

export type SecretMetadata = {
  secretId: string;
  organizationId: string;
  scope: string;
  purpose: string;
  state: SecretVersionState;
  version: number;
  allowedEnvironments: string[];
  allowedTools: string[];
  rotatedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
  lastUsedBy?: string;
  usageCount: number;
};

export type ToolSecurityPolicy = {
  policyId: string;
  organizationId: string;
  allowedDestinations: string[];
  allowedDataClasses: string[];
  deniedActions: string[];
  maxCostCents: number;
  requireIdempotencyForWrites: boolean;
  riskDecisions: Record<"read" | "write" | "destructive" | "unknown", SecurityRiskDecision>;
};

export type ToolSecurityRequest = {
  organizationId: string;
  action: string;
  risk: "read" | "write" | "destructive" | "unknown";
  destination?: string;
  dataClasses: string[];
  estimatedCostCents: number;
  idempotencyKey?: string;
};

const SENSITIVE_DIFF_KEY = /secret|token|password|authorization|api[-_]?key|credential|transcript|recording|phone|email/i;
const PRIVATE_DESTINATION = /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^169\.254\.)|(^0\.)|(^::1$)/i;

export function buildCanonicalAuditEvent(event: Omit<CanonicalAuditEvent, "eventId" | "diff"> & { diff?: Record<string, unknown> }): CanonicalAuditEvent {
  return {
    ...event,
    eventId: `aud_${createHash("sha256").update(stableStringify({ organizationId: event.organizationId, action: event.action, resource: event.resource, occurredAt: event.occurredAt, correlationId: event.correlationId })).digest("hex").slice(0, 16)}`,
    diff: event.diff ? redactAuditDiff(event.diff) : undefined,
  };
}

export function redactAuditDiff(diff: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(diff).map(([key, value]) => {
    if (SENSITIVE_DIFF_KEY.test(key)) return [key, "[redacted]"];
    if (value && typeof value === "object" && !Array.isArray(value)) return [key, redactAuditDiff(value as Record<string, unknown>)];
    return [key, value];
  }));
}

export function evaluateSecretUse(secret: SecretMetadata, request: { organizationId: string; environment: string; toolId: string; now: string }) {
  const reasons: string[] = [];
  if (secret.organizationId !== request.organizationId) reasons.push("organization mismatch");
  if (!["active", "rotating"].includes(secret.state)) reasons.push(`secret state is ${secret.state}`);
  if (secret.revokedAt) reasons.push("secret revoked");
  if (secret.expiresAt && new Date(secret.expiresAt) <= new Date(request.now)) reasons.push("secret expired");
  if (!secret.allowedEnvironments.includes(request.environment)) reasons.push("environment not allowed");
  if (!secret.allowedTools.includes(request.toolId)) reasons.push("tool not allowed");
  return { allowed: reasons.length === 0, reasons };
}

export function evaluateToolSecurityPolicy(policy: ToolSecurityPolicy, request: ToolSecurityRequest) {
  const reasons: string[] = [];
  if (policy.organizationId !== request.organizationId) reasons.push("organization mismatch");
  if (policy.deniedActions.includes(request.action)) reasons.push("action denied");
  if (request.destination && !policy.allowedDestinations.includes(request.destination)) reasons.push("destination not allowed");
  if (request.destination && PRIVATE_DESTINATION.test(request.destination)) reasons.push("private destination blocked");
  for (const dataClass of request.dataClasses) if (!policy.allowedDataClasses.includes(dataClass)) reasons.push(`data class not allowed: ${dataClass}`);
  if (request.estimatedCostCents > policy.maxCostCents) reasons.push("estimated cost exceeds policy");
  if (policy.requireIdempotencyForWrites && request.risk !== "read" && !request.idempotencyKey) reasons.push("idempotency key required");
  const decision = policy.riskDecisions[request.risk] ?? "deny";
  if (decision === "deny") reasons.push(`risk denied: ${request.risk}`);
  return { allowed: reasons.length === 0 && ["allow", "confirm", "approve"].includes(decision), decision: reasons.length > 0 ? "deny" as const : decision, reasons };
}

export function buildIntegrityCheckpoint(events: CanonicalAuditEvent[]) {
  const ordered = [...events].sort((left, right) => left.eventId.localeCompare(right.eventId));
  return {
    firstEventId: ordered[0]?.eventId ?? null,
    lastEventId: ordered.at(-1)?.eventId ?? null,
    count: ordered.length,
    digest: createHash("sha256").update(ordered.map((event) => event.eventId).join("\n")).digest("hex"),
  };
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
