import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const SECRET_PREFIX = "qvsec:v1:";
const SECRET_REF_PREFIX = "qvsecret:";
const REDACTED_SECRET_VALUE = null;

type SecretMapValue = {
  type?: unknown;
  value?: unknown;
  redacted?: unknown;
};

export function encryptSecretValue(value: string) {
  if (isEncryptedSecretValue(value)) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    iv.toString("base64url"),
    ".",
    tag.toString("base64url"),
    ".",
    ciphertext.toString("base64url"),
  ].join("");
}

export function decryptSecretValue(value: string) {
  if (!isEncryptedSecretValue(value)) return value;

  const payload = value.slice(SECRET_PREFIX.length);
  const [ivText, tagText, ciphertextText] = payload.split(".");
  if (!ivText || !tagText || !ciphertextText) {
    throw new Error("Invalid encrypted secret envelope");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedSecretValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(SECRET_PREFIX);
}

export function isSecretReference(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(SECRET_REF_PREFIX);
}

export function toSecretReference(secretId: string) {
  return `${SECRET_REF_PREFIX}${secretId}`;
}

export function secretIdFromReference(reference: string) {
  return reference.slice(SECRET_REF_PREFIX.length);
}

export function encryptSecretFields<T>(value: T): T {
  return visitSecretFields(value, "encrypt") as T;
}

export function redactSecretFields<T>(value: T): T {
  return visitSecretFields(value, "redact") as T;
}

export function resolveSecretFields<T>(value: T): T {
  return visitSecretFields(value, "resolve") as T;
}

export function encryptKeyValueSecrets<T>(value: T): T {
  return visitKeyValueFields(value, "encrypt") as T;
}

export function redactKeyValueSecrets<T>(value: T): T {
  return visitKeyValueFields(value, "redact") as T;
}

export function resolveKeyValueSecrets<T>(value: T): T {
  return visitKeyValueFields(value, "resolve") as T;
}

export function restoreRedactedSecretReferences<T>(
  value: T,
  existingValue: unknown
): T {
  return restoreRedactedValue(value, existingValue) as T;
}

function visitSecretFields(value: unknown, mode: "encrypt" | "redact" | "resolve"): unknown {
  if (Array.isArray(value)) return value.map((item) => visitSecretFields(item, mode));
  if (!isRecord(value)) return value;

  if (value.type === "Secret") {
    return transformSecretMapValue(value, mode);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, visitSecretFields(item, mode)])
  );
}

function visitKeyValueFields(value: unknown, mode: "encrypt" | "redact" | "resolve"): unknown {
  if (Array.isArray(value)) return value.map((item) => visitKeyValueFields(item, mode));
  if (!isRecord(value)) return value;

  const next = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, visitKeyValueFields(item, mode)])
  );

  if (typeof next.key === "string" && typeof next.value === "string") {
    if (mode === "encrypt") {
      next.value = encryptSecretValue(next.value);
    } else if (mode === "redact" && (isEncryptedSecretValue(next.value) || isSecretReference(next.value))) {
      next.value = REDACTED_SECRET_VALUE;
      next.redacted = true;
    } else if (mode === "resolve") {
      next.value = decryptSecretValue(next.value);
    }
  }

  return next;
}

function transformSecretMapValue(value: SecretMapValue, mode: "encrypt" | "redact" | "resolve") {
  const next: Record<string, unknown> = { ...value };

  if (mode === "encrypt" && typeof next.value === "string") {
    next.value = encryptSecretValue(next.value);
    delete next.redacted;
    return next;
  }

  if (mode === "redact") {
    next.value = REDACTED_SECRET_VALUE;
    next.redacted = true;
    return next;
  }

  if (mode === "resolve" && typeof next.value === "string") {
    next.value = decryptSecretValue(next.value);
  }

  return next;
}

function restoreRedactedValue(
  value: unknown,
  existingValue: unknown
): unknown {
  if (Array.isArray(value)) {
    const existingItems = Array.isArray(existingValue) ? existingValue : [];
    return value.map((item, index) => {
      const itemKey =
        isRecord(item) && typeof item.key === "string" ? item.key : null;
      const existingItem = itemKey
        ? existingItems.find(
            (candidate) =>
              isRecord(candidate) && candidate.key === itemKey
          )
        : existingItems[index];
      return restoreRedactedValue(item, existingItem);
    });
  }
  if (!isRecord(value)) return value;

  if (
    value.redacted === true &&
    (value.value === null || value.value === "")
  ) {
    const storedValue = isRecord(existingValue)
      ? existingValue.value
      : undefined;
    if (
      typeof storedValue !== "string" ||
      (!isSecretReference(storedValue) &&
        !isEncryptedSecretValue(storedValue))
    ) {
      throw new Error("A redacted secret no longer has a stored value");
    }
    const restored: Record<string, unknown> = {
      ...value,
      value: storedValue,
    };
    delete restored.redacted;
    return restored;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "redacted")
      .map(([key, item]) => [
        key,
        restoreRedactedValue(
          item,
          isRecord(existingValue) ? existingValue[key] : undefined
        ),
      ])
  );
}

function getEncryptionKey() {
  const material = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (!material) {
    throw new Error("SECRET_ENCRYPTION_KEY is required to encrypt integration secrets");
  }

  const hexKey = /^[a-f0-9]{64}$/i.test(material)
    ? Buffer.from(material, "hex")
    : null;
  if (hexKey?.length === 32) return hexKey;

  const base64Key = Buffer.from(material, "base64");
  if (base64Key.length === 32) return base64Key;

  return createHash("sha256").update(material).digest();
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
