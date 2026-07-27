type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type KbProcessingPayload = {
  agentId: string;
  organizationId: string;
  documents: Array<Record<string, unknown>>;
  budgets?: Record<string, unknown>;
};

type KbProcessingResponse = {
  jobId?: unknown;
  status?: unknown;
  statusUrl?: unknown;
  processed?: unknown;
  documents?: unknown;
};

type KbProcessingStatusHandler = (
  status: KbProcessingResponse,
) => void | Promise<void>;

const TERMINAL_JOB_STATUSES = new Set([
  "succeeded",
  "partial_failed",
  "failed",
  "canceled",
]);

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;

export async function processKbDocuments({
  aiApiUrl,
  internalApiKey,
  payload,
  fetchImpl = fetch,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onStatus,
}: {
  aiApiUrl: string;
  internalApiKey: string;
  payload: KbProcessingPayload;
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onStatus?: KbProcessingStatusHandler;
}) {
  const baseUrl = trimTrailingSlashes(aiApiUrl);
  const body = await fetchJson(fetchImpl, `${baseUrl}/kb/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalApiKey,
    },
    body: JSON.stringify(payload),
  });
  await onStatus?.(body);

  if (Array.isArray(body.processed) || isTerminalJob(body)) {
    return body;
  }

  const statusUrl = buildStatusUrl(baseUrl, body);
  if (!statusUrl) {
    return body;
  }

  return pollKbJob({
    fetchImpl,
    statusUrl,
    internalApiKey,
    pollIntervalMs,
    timeoutMs,
    jobId: getString(body.jobId) ?? statusUrl,
    onStatus,
  });
}

export async function deleteKbDocumentVectors({
  aiApiUrl,
  internalApiKey,
  agentId,
  kbId,
  fetchImpl = fetch,
}: {
  aiApiUrl: string;
  internalApiKey: string;
  agentId: string;
  kbId: string;
  fetchImpl?: FetchLike;
}) {
  const baseUrl = trimTrailingSlashes(aiApiUrl);
  await fetchJson(
    fetchImpl,
    `${baseUrl}/kb/${encodeURIComponent(agentId)}/${encodeURIComponent(kbId)}`,
    {
      method: "DELETE",
      headers: { "x-internal-key": internalApiKey },
    },
  );
}

async function pollKbJob({
  fetchImpl,
  statusUrl,
  internalApiKey,
  pollIntervalMs,
  timeoutMs,
  jobId,
  onStatus,
}: {
  fetchImpl: FetchLike;
  statusUrl: string;
  internalApiKey: string;
  pollIntervalMs: number;
  timeoutMs: number;
  jobId: string;
  onStatus?: KbProcessingStatusHandler;
}) {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const body = await fetchJson(fetchImpl, statusUrl, {
      method: "GET",
      headers: { "x-internal-key": internalApiKey },
    });
    await onStatus?.(body);

    if (isTerminalJob(body)) {
      return body;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `KB processing job ${jobId} did not complete within ${timeoutMs}ms`,
      );
    }

    await delay(pollIntervalMs);
  }
}

async function fetchJson(fetchImpl: FetchLike, url: string, init: RequestInit) {
  const response = await fetchImpl(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`KB processing failed with HTTP ${response.status}`);
  }

  if (!text) {
    return {} as KbProcessingResponse;
  }

  try {
    return JSON.parse(text) as KbProcessingResponse;
  } catch {
    throw new Error(
      `KB processing returned a non-JSON response with HTTP ${response.status}`,
    );
  }
}

function buildStatusUrl(baseUrl: string, body: KbProcessingResponse) {
  const statusUrl = getString(body.statusUrl);
  if (statusUrl) {
    if (statusUrl.startsWith("http://") || statusUrl.startsWith("https://")) {
      return statusUrl;
    }
    return `${baseUrl}${statusUrl.startsWith("/") ? "" : "/"}${statusUrl}`;
  }

  const jobId = getString(body.jobId);
  return jobId ? `${baseUrl}/kb/jobs/${encodeURIComponent(jobId)}` : null;
}

function isTerminalJob(body: KbProcessingResponse) {
  const status = getString(body.status);
  return status ? TERMINAL_JOB_STATUSES.has(status) : false;
}

function getString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function trimTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

async function delay(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
