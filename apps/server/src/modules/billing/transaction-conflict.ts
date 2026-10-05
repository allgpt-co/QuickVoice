const RETRYABLE_TRANSACTION_CODES = new Set(["P2034", "40001", "40P01"]);
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY_MS = 10;
const DEFAULT_MAX_DELAY_MS = 250;

type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

export async function withTransactionConflictRetries<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? delay;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableTransactionConflict(error)) {
        throw error;
      }
      await sleep(retryDelayMs(attempt, baseDelayMs, maxDelayMs, random()));
    }
  }
}

export function retryDelayMs(
  completedAttempt: number,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
  randomValue = Math.random(),
) {
  const ceiling = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, completedAttempt - 1),
  );
  const floor = Math.ceil(ceiling / 2);
  const jitter = Math.min(1, Math.max(0, randomValue));
  return floor + Math.floor(jitter * (ceiling - floor));
}

function delay(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export function isRetryableTransactionConflict(error: unknown): boolean {
  const pending = [error];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);

    const candidate = value as Record<string, unknown>;
    if (
      isRetryableCode(candidate.code) ||
      isRetryableCode(candidate.originalCode) ||
      isRetryableCode(candidate.sqlState) ||
      candidate.kind === "TransactionWriteConflict" ||
      hasRetryableSqlState(candidate.message)
    ) {
      return true;
    }

    pending.push(candidate.cause);
    const meta = candidate.meta;
    if (meta && typeof meta === "object") {
      const metadata = meta as Record<string, unknown>;
      pending.push(metadata.driverAdapterError, metadata.cause);
    }
  }

  return false;
}

function isRetryableCode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    RETRYABLE_TRANSACTION_CODES.has(value.toUpperCase())
  );
}

function hasRetryableSqlState(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /SQLSTATE\s*:?\s*(?:40001|40P01)\b/i.test(value)
  );
}
