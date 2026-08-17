type ProviderErrorShape = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
};

function numericStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as ProviderErrorShape;
  for (const value of [candidate.status, candidate.statusCode]) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) {
      return Number(value);
    }
  }
  return undefined;
}

export function isProviderNotFoundError(error: unknown): boolean {
  const status = numericStatus(error);
  if (status === 404) return true;
  if (!error || typeof error !== "object") return false;
  const code = (error as ProviderErrorShape).code;
  // Twilio's REST API uses 20404 for a missing resource.
  return code === 20404 || code === "20404" || code === "not_found";
}

export function isDefinitiveProviderError(error: unknown): boolean {
  const status = numericStatus(error);
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    ![408, 409, 425, 429].includes(status)
  );
}

export function providerErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as ProviderErrorShape;
    if (
      typeof candidate.code === "string" ||
      typeof candidate.code === "number"
    ) {
      return String(candidate.code).slice(0, 100);
    }
    const status = numericStatus(error);
    if (status !== undefined) return `HTTP_${status}`;
  }
  return "PROVIDER_ERROR";
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1_000);
}
