export type ApiErrorStateKind = "permission" | "offline" | "error";

export type ApiErrorStateReason =
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "server"
  | "unknown";

export type ApiErrorStateCopy = {
  kind: ApiErrorStateKind;
  reason: ApiErrorStateReason;
  title: string;
  description: string;
  status?: number;
  code?: string;
};

export type ApiErrorStateCopyOptions = {
  resourceName: string;
  isOnline?: boolean;
  overrides?: Partial<
    Record<
      ApiErrorStateReason,
      Partial<Pick<ApiErrorStateCopy, "title" | "description">>
    >
  >;
};

const AUTH_CODES = new Set([
  "AUTH_REQUIRED",
  "AUTHENTICATION_REQUIRED",
  "SESSION_EXPIRED",
  "TOKEN_EXPIRED",
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
]);

const FORBIDDEN_CODES = new Set([
  "ACCESS_DENIED",
  "FORBIDDEN",
  "INSUFFICIENT_PERMISSIONS",
  "PERMISSION_DENIED",
]);

const NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ERR_NETWORK",
  "FETCH_FAILED",
  "NETWORK_ERROR",
  "OFFLINE",
  "REQUEST_TIMEOUT",
  "TIMEOUT",
]);

const NETWORK_MESSAGE_PATTERNS = [
  /failed to fetch/i,
  /internet connection appears to be offline/i,
  /load failed/i,
  /network ?error/i,
  /network request failed/i,
];

const SERVER_CODES = new Set([
  "BAD_GATEWAY",
  "GATEWAY_TIMEOUT",
  "INTERNAL_SERVER_ERROR",
  "SERVICE_UNAVAILABLE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function numberProperty(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "number" ? value[key] : undefined;
}

export function apiErrorStatus(error: unknown) {
  if (!isRecord(error)) return undefined;

  const directStatus = numberProperty(error, "status");
  if (directStatus !== undefined) return directStatus;

  const statusCode = numberProperty(error, "statusCode");
  if (statusCode !== undefined) return statusCode;

  const response = error.response;
  if (isRecord(response)) return numberProperty(response, "status");

  return undefined;
}

function stringProperty(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : undefined;
}

export function apiErrorCode(error: unknown) {
  if (!isRecord(error)) return undefined;

  const directCode = stringProperty(error, "code");
  if (directCode) return directCode;

  const response = error.response;
  if (!isRecord(response)) return undefined;

  const data = response.data;
  if (!isRecord(data)) return undefined;

  const envelopeError = data.error;
  if (isRecord(envelopeError)) return stringProperty(envelopeError, "code");

  return stringProperty(data, "code");
}

function apiErrorMessage(error: unknown) {
  if (!isRecord(error)) return undefined;

  const directMessage = stringProperty(error, "message");
  if (directMessage) return directMessage;

  const response = error.response;
  if (!isRecord(response)) return undefined;

  const data = response.data;
  if (!isRecord(data)) return undefined;

  const envelopeError = data.error;
  if (isRecord(envelopeError)) {
    const envelopeMessage = stringProperty(envelopeError, "message");
    if (envelopeMessage) return envelopeMessage;
  }

  return stringProperty(data, "message");
}

function normalizeCode(code?: string) {
  return code?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") || undefined;
}

function matchesCode(code: string | undefined, values: Set<string>) {
  if (!code) return false;
  if (values.has(code)) return true;

  return Array.from(values).some((value) => code.includes(value));
}

function matchesNetworkMessage(message: string | undefined) {
  return Boolean(
    message && NETWORK_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  );
}

function resourceLabel(resourceName: string) {
  return resourceName.trim() || "workspace data";
}

function titleResource(resourceName: string) {
  const resource = resourceLabel(resourceName);
  return `${resource.charAt(0).toUpperCase()}${resource.slice(1)}`;
}

function withOverride(
  copy: ApiErrorStateCopy,
  overrides: ApiErrorStateCopyOptions["overrides"]
) {
  const override = overrides?.[copy.reason];
  return override ? { ...copy, ...override } : copy;
}

function errorMetadata(
  status: number | undefined,
  code: string | undefined
): Pick<ApiErrorStateCopy, "status" | "code"> {
  const metadata: Pick<ApiErrorStateCopy, "status" | "code"> = {};
  if (status !== undefined) metadata.status = status;
  if (code !== undefined) metadata.code = code;
  return metadata;
}

export function getApiErrorStateCopy(
  error: unknown,
  options: ApiErrorStateCopyOptions
): ApiErrorStateCopy {
  const status = apiErrorStatus(error);
  const code = normalizeCode(apiErrorCode(error));
  const message = apiErrorMessage(error);
  const resource = resourceLabel(options.resourceName);
  const titledResource = titleResource(resource);
  const base = errorMetadata(status, code);

  if (status === 401 || matchesCode(code, AUTH_CODES)) {
    return withOverride(
      {
        ...base,
        kind: "permission",
        reason: "unauthorized",
        title: `Sign in to load ${resource}`,
        description: `Your QuickVoice session expired or the API rejected authentication. Sign in again, then retry loading ${resource}.`,
      },
      options.overrides
    );
  }

  if (status === 403 || matchesCode(code, FORBIDDEN_CODES)) {
    return withOverride(
      {
        ...base,
        kind: "permission",
        reason: "forbidden",
        title: `${titledResource} access required`,
        description: `Your current role does not include permission to load ${resource}. Ask a workspace owner to update your role or switch organizations.`,
      },
      options.overrides
    );
  }

  if (
    options.isOnline === false ||
    status === 0 ||
    matchesCode(code, NETWORK_CODES) ||
    matchesNetworkMessage(message)
  ) {
    return withOverride(
      {
        ...base,
        kind: "offline",
        reason: "offline",
        title: `${titledResource} unavailable offline`,
        description: `Reconnect to the internet, then retry loading ${resource}. If cached data is available, QuickVoice will keep it visible while you reconnect.`,
      },
      options.overrides
    );
  }

  if (
    (typeof status === "number" && status >= 500) ||
    matchesCode(code, SERVER_CODES)
  ) {
    return withOverride(
      {
        ...base,
        kind: "error",
        reason: "server",
        title: "QuickVoice service unavailable",
        description: `The API returned a server error while loading ${resource}. Retry in a moment; this is not caused by your browser connection.`,
      },
      options.overrides
    );
  }

  return withOverride(
    {
      ...base,
      kind: "error",
      reason: "unknown",
      title: `Could not load ${resource}`,
      description: `Retry loading ${resource}. If the problem continues, share the issue with support.`,
    },
    options.overrides
  );
}
