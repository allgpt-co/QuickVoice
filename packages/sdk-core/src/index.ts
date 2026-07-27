export type QuickVoiceClientConfig = {
  baseUrl: string;
  apiKey: string;
  userAgent: string;
  timeoutMs: number;
  debug?: boolean;
};

export type RetryDecisionInput = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  status?: number;
  errorCode?: string;
  retryAfterMs?: number;
  idempotencyKey?: string;
  attempt: number;
  maxAttempts: number;
};

export type QuickVoicePage<T> = {
  data: T[];
  nextCursor?: string | null;
};

const SECRET_PATTERN = /(authorization|api[-_]?key|token|secret|password|signed[_-]?secret)(["'\s:=]+)([^"'\s,}]+)/gi;
const PII_PATTERN = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d .()\-]{7,}\d)/gi;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class QuickVoiceApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(args: { message: string; code: string; status: number; requestId?: string; details?: unknown }) {
    super(args.message);
    this.name = "QuickVoiceApiError";
    this.code = args.code;
    this.status = args.status;
    this.requestId = args.requestId;
    this.details = args.details;
  }
}

export function createQuickVoiceClientConfig(args: { apiKey: string; baseUrl?: string; userAgent?: string; timeoutMs?: number; debug?: boolean }): QuickVoiceClientConfig {
  if (!args.apiKey.trim()) throw new Error("apiKey is required");
  const baseUrl = new URL(args.baseUrl ?? "https://api.quickvoice.co");
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("baseUrl must use http or https");
  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    apiKey: args.apiKey,
    userAgent: args.userAgent ?? "quickvoice-sdk-js/0.0.0",
    timeoutMs: args.timeoutMs ?? 30_000,
    debug: args.debug,
  };
}

export function shouldRetryRequest(input: RetryDecisionInput) {
  if (input.attempt >= input.maxAttempts) return { retry: false, reason: "max_attempts" as const };
  const retryableStatus = input.status === 429 || (input.status !== undefined && input.status >= 500);
  const retryableNetwork = input.errorCode === "ETIMEDOUT" || input.errorCode === "ECONNRESET";
  if (!retryableStatus && !retryableNetwork) return { retry: false, reason: "not_retryable" as const };
  if (MUTATING_METHODS.has(input.method) && !input.idempotencyKey) return { retry: false, reason: "mutation_requires_idempotency_key" as const };
  return { retry: true, reason: "retryable" as const, delayMs: input.retryAfterMs ?? Math.min(30_000, 500 * 2 ** input.attempt) };
}

export async function collectAllPages<T>(firstCursor: string | undefined, fetchPage: (cursor?: string) => Promise<QuickVoicePage<T>>) {
  const items: T[] = [];
  let cursor: string | undefined = firstCursor;
  do {
    const page = await fetchPage(cursor);
    items.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export function redactSdkLog(value: unknown): string {
  return (JSON.stringify(value) ?? String(value))
    .replace(SECRET_PATTERN, "$1$2[redacted]")
    .replace(PII_PATTERN, "[redacted]");
}

export function cliExitCodeForStatus(status: "success" | "validation_error" | "auth_error" | "not_found" | "rate_limited" | "server_error" | "canceled") {
  return {
    success: 0,
    validation_error: 2,
    auth_error: 3,
    not_found: 4,
    rate_limited: 6,
    server_error: 10,
    canceled: 130,
  }[status];
}
