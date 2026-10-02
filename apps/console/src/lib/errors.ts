import { AxiosError, isAxiosError } from "axios";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  retryAt?: number;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (isAxiosError(err)) {
    const ax = err as AxiosError<{
      success?: boolean;
      code?: string;
      message?: string;
      error?: { code?: string; message?: string; details?: unknown };
    }>;
    const status = ax.response?.status ?? 0;
    const body = ax.response?.data;
    const message =
      body?.error?.message ??
      body?.message ??
      ax.message ??
      "Request failed";
    const code = body?.error?.code ?? body?.code;
    const details = body?.error?.details;
    const apiError = new ApiError(message, status, code, details);
    if (status === 429) {
      const retryAfter = String(ax.response?.headers?.["retry-after"] ?? "").trim();
      const now = Date.now();
      const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : NaN;
      const deadline = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retryAfter);
      apiError.retryAt = Number.isFinite(deadline) && deadline > now ? deadline : now + 60_000;
    }
    return apiError;
  }

  if (err instanceof Error) return new ApiError(err.message, 0);
  return new ApiError("Unknown error", 0);
}

export function retryApiQuery(failureCount: number, error: Error) {
  if (failureCount >= 1) return false;
  return !(error instanceof ApiError) || error.status === 0 || error.status === 429 || error.status >= 500;
}

export function apiQueryRetryDelay(_attempt: number, error: Error) {
  if (error instanceof ApiError && error.status === 429) {
    return Math.max(1000, (error.retryAt ?? Date.now() + 60_000) - Date.now());
  }
  return 1000;
}
