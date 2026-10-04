import { BadRequestError } from "../../common/errors/badRequest.js";
import {
  isEncryptedSecretValue,
  isSecretReference,
} from "../../lib/secrets.js";

const SECRET_FIELDS = ["api_headers", "dynamic_variables"] as const;

type StoredTool = {
  api_url: string;
  api_headers?: unknown;
  dynamic_variables?: unknown;
};

type ToolUpdate = {
  api_url?: string;
  api_headers?: unknown;
  dynamic_variables?: unknown;
};

export function assertSafeToolSecretDestinationUpdate(
  existing: StoredTool,
  update: ToolUpdate,
  destination = "tool API",
) {
  if (
    !update.api_url ||
    new URL(existing.api_url).origin === new URL(update.api_url).origin
  ) {
    return;
  }

  const retainedSecretFields = SECRET_FIELDS.filter(
    (field) =>
      containsStoredToolValues(existing[field]) &&
      !explicitlyReplacesStoredSecrets(update, field),
  );

  if (retainedSecretFields.length > 0) {
    throw new BadRequestError(
      `Changing the ${destination} origin requires replacing or removing its saved secrets`,
    );
  }
}

function explicitlyReplacesStoredSecrets(
  update: ToolUpdate,
  field: (typeof SECRET_FIELDS)[number],
) {
  return (
    Object.prototype.hasOwnProperty.call(update, field) &&
    !containsStoredSecret(update[field]) &&
    !containsRedactedSecret(update[field])
  );
}

function containsStoredToolValues(value: unknown): boolean {
  // Tool headers and dynamic variables are secret-bearing fields. Treat legacy
  // plaintext rows as sensitive too, even if they predate secret references.
  if (Array.isArray(value)) return value.length > 0;
  return containsStoredSecret(value) || (isRecord(value) && Object.values(value).some(
    (entry) => isRecord(entry) && entry.type === "Secret" && typeof entry.value === "string",
  ));
}

function containsStoredSecret(value: unknown): boolean {
  if (isSecretReference(value) || isEncryptedSecretValue(value)) return true;
  if (Array.isArray(value)) return value.some(containsStoredSecret);
  if (!isRecord(value)) return false;
  return Object.values(value).some(containsStoredSecret);
}

function containsRedactedSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRedactedSecret);
  if (!isRecord(value)) return false;
  if (value.redacted === true) return true;
  return Object.values(value).some(containsRedactedSecret);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertSafeWebhookSecretDestinationUpdate(existing: unknown, update: unknown) {
  if (!isRecord(existing) || !isRecord(update) || typeof existing.webhook_url !== "string") return;
  assertSafeToolSecretDestinationUpdate(
    { api_url: existing.webhook_url, api_headers: existing.headers, dynamic_variables: existing.body },
    {
      api_url: typeof update.webhook_url === "string" ? update.webhook_url : undefined,
      // Webhook config replaces these maps; an omitted map removes it.
      api_headers: update.headers ?? null,
      dynamic_variables: update.body ?? null,
    },
    "webhook",
  );
}
