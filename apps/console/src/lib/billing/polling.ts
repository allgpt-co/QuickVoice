export const BILLING_POLL_INTERVAL_MS = 2_000;
export const BILLING_POLL_TIMEOUT_MS = 30_000;

export type BillingPollResult = "matched" | "timed-out" | "aborted";

interface PollForBillingUpdateOptions {
  check: () => boolean | Promise<boolean>;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function pollForBillingUpdate({
  check,
  intervalMs = BILLING_POLL_INTERVAL_MS,
  timeoutMs = BILLING_POLL_TIMEOUT_MS,
  signal,
}: PollForBillingUpdateOptions): Promise<BillingPollResult> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const delayMs = Math.max(1, intervalMs);

  while (!signal?.aborted) {
    try {
      if (await check()) return "matched";
    } catch {
      // A transient refresh failure should not stop the confirmation window.
    }

    if (signal?.aborted) return "aborted";

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return "timed-out";

    const completedDelay = await waitForDelay(
      Math.min(delayMs, remainingMs),
      signal,
    );
    if (!completedDelay) return "aborted";
  }

  return "aborted";
}

function waitForDelay(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const onAbort = () => {
      globalThis.clearTimeout(timeoutId);
      resolve(false);
    };
    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
