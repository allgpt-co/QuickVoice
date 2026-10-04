import { createHash } from "node:crypto";
import { currentAuthContext } from "./auth-context.js";

const trim = (value: string) => value.replace(/\/+$/, "");

export const quickvoiceApiBaseUrl = trim(
  process.env.QUICKVOICE_API_BASE_URL ?? "http://localhost:5000/api/v1",
);

export type ApiCall = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
};

export class UpstreamApiError extends Error {
  constructor(readonly status: number) {
    super(`QuickVoice API request failed with HTTP ${status}`);
  }
}

// Fingerprints only; bounded cache does not retain credentials. Tool requests still
// authorize against the API on every call, including revoked keys.
const keyChecks = new Map<string, { valid: boolean; expires: number }>();
export async function validateQuickVoiceApiKey(apiKey: string) {
  const fingerprint = createHash("sha256").update(apiKey).digest("hex");
  const cached = keyChecks.get(fingerprint);
  if (cached && cached.expires > Date.now()) return cached.valid;
  const remember = (valid: boolean) => {
    if (keyChecks.size >= 1_000) keyChecks.delete(keyChecks.keys().next().value!);
    keyChecks.set(fingerprint, { valid, expires: Date.now() + (valid ? 15_000 : 60_000) });
    return valid;
  };
  const response = await fetch(`${quickvoiceApiBaseUrl}/agents`, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    return remember(false);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new UpstreamApiError(response.status);
  }
  await response.body?.cancel();
  return remember(true);
}

export async function callQuickVoiceApi<T = unknown>({ method, path, query, body, signal }: ApiCall): Promise<T> {
  const deadline = AbortSignal.timeout(30_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    requestSignal.throwIfAborted();
    const { upstreamApiKey } = currentAuthContext();
    const url = new URL(`${quickvoiceApiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": upstreamApiKey,
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal: requestSignal,
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new UpstreamApiError(response.status);
    }

    const payload = await response.json().catch(() => {
      requestSignal.throwIfAborted();
      return null;
    });
    requestSignal.throwIfAborted();
    if (payload && typeof payload === "object" && "data" in payload) {
      return (payload as { data: T }).data;
    }
    return payload as T;
  } catch (error) {
    // Both tool and resource handlers expose thrown messages through the MCP SDK.
    if (requestSignal.aborted) {
      throw new Error(deadline.aborted
        ? "QuickVoice API request timed out. Check the operation status before retrying."
        : "QuickVoice API request cancelled.");
    }
    if (error instanceof UpstreamApiError) throw error;
    throw new Error("QuickVoice API request failed. Please try again.");
  }
}
