import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import net from "node:net";

export type EventEnvelope = {
  eventId: string;
  type: string;
  schemaVersion: string;
  organizationId: string;
  environmentId?: string;
  occurredAt: string;
  createdAt: string;
  correlationId?: string;
  resource: { type: string; id: string };
  payload: Record<string, unknown>;
};

export type EventSubscription = {
  subscriptionId: string;
  organizationId: string;
  endpoint: string;
  enabled: boolean;
  eventTypes: string[];
  payloadVersion: string;
  secretVersionId: string;
  environmentId?: string;
};

export type DeliveryAttemptInput = {
  attempt: number;
  maxAttempts: number;
  retryAfterMs?: number;
  statusCode?: number;
  errorCategory?: "timeout" | "network" | "tls" | "receiver_4xx" | "receiver_5xx" | "rate_limited";
};

const DEFAULT_TOLERANCE_SECONDS = 300;
const SENSITIVE_PAYLOAD_KEY = /secret|token|password|authorization|recording|transcript|phone|email/i;
const PRIVATE_HOSTS = /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^169\.254\.)|(^0\.)|(^::1$)|(^fc)|(^fd)/i;

export function canonicalEventBytes(envelope: EventEnvelope) {
  return Buffer.from(stableStringify(envelope));
}

export function signEventDelivery(args: { deliveryId: string; timestamp: number; body: Buffer | string; secret: string }) {
  const signedPayload = `${args.deliveryId}.${args.timestamp}.${Buffer.isBuffer(args.body) ? args.body.toString("utf8") : args.body}`;
  return `t=${args.timestamp},v1=${createHmac("sha256", args.secret).update(signedPayload).digest("hex")}`;
}

export function verifyEventSignature(args: { deliveryId: string; timestamp: number; body: Buffer | string; secret: string; signatureHeader: string; now?: number; toleranceSeconds?: number }) {
  const now = args.now ?? Math.floor(Date.now() / 1000);
  const tolerance = args.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - args.timestamp) > tolerance) return false;
  const expected = signEventDelivery(args).split("v1=")[1] ?? "";
  const actual = args.signatureHeader.split("v1=")[1] ?? "";
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function validateEventSubscription(subscription: EventSubscription) {
  const issues: string[] = [];
  if (!subscription.enabled) return issues;
  const url = safeParseUrl(subscription.endpoint);
  if (!url) issues.push("endpoint must be a valid URL");
  else {
    if (url.protocol !== "https:") issues.push("endpoint must use https");
    if (isPrivateHost(url.hostname)) issues.push("endpoint host is private or link-local");
  }
  if (subscription.eventTypes.length === 0) issues.push("subscription requires at least one event type");
  return issues;
}

export function redactEventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => {
    if (SENSITIVE_PAYLOAD_KEY.test(key)) return [key, "[redacted]"];
    if (value && typeof value === "object" && !Array.isArray(value)) return [key, redactEventPayload(value as Record<string, unknown>)];
    return [key, value];
  }));
}

export function nextDeliveryAttempt(input: DeliveryAttemptInput) {
  const retryable = isRetryable(input);
  if (!retryable || input.attempt >= input.maxAttempts) {
    return { state: "dead_letter" as const, retryable: false, nextRetryDelayMs: null };
  }
  if (input.retryAfterMs !== undefined) return { state: "retry_scheduled" as const, retryable: true, nextRetryDelayMs: input.retryAfterMs };
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, input.attempt - 1));
  const jitter = deterministicJitter(input.attempt);
  return { state: "retry_scheduled" as const, retryable: true, nextRetryDelayMs: base + jitter };
}

export function buildReplayDelivery(original: EventEnvelope, subscription: EventSubscription) {
  return {
    deliveryId: `evt_del_${randomUUID()}`,
    subscriptionId: subscription.subscriptionId,
    eventId: original.eventId,
    payloadVersion: original.schemaVersion,
    body: canonicalEventBytes(original),
    replayed: true,
  };
}

function isRetryable(input: DeliveryAttemptInput) {
  if (input.errorCategory === "rate_limited" || input.statusCode === 429) return true;
  if (input.errorCategory === "timeout" || input.errorCategory === "network" || input.errorCategory === "tls") return true;
  if (input.statusCode !== undefined) return input.statusCode >= 500;
  return input.errorCategory !== "receiver_4xx";
}

function safeParseUrl(value: string) {
  try { return new URL(value); } catch { return null; }
}

function isPrivateHost(hostname: string) {
  if (PRIVATE_HOSTS.test(hostname)) return true;
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 0) return false;
  return PRIVATE_HOSTS.test(hostname);
}

function deterministicJitter(attempt: number) {
  return (attempt * 137) % 500;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
