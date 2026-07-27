import { randomUUID } from "node:crypto";

import prisma from "../../config/prisma.js";
import {
  decryptSecretValue,
  encryptSecretValue,
  isEncryptedSecretValue,
  isSecretReference,
  secretIdFromReference,
  toSecretReference,
} from "../../lib/secrets.js";

type SecretContext = {
  organizationId: string;
  userId?: string | null;
  namePrefix: string;
  createdSecretIds?: string[];
};

export async function storeSecretReferences<T>(
  value: T,
  context: SecretContext,
): Promise<T> {
  return visitSecretFields(value, context, []) as Promise<T>;
}

export async function storeKeyValueSecretReferences<T>(
  value: T,
  context: SecretContext,
): Promise<T> {
  return visitKeyValueFields(value, context, []) as Promise<T>;
}

export async function resolveSecretReferences<T>(
  value: T,
  organizationId: string,
): Promise<T> {
  return resolveReferences(value, organizationId) as Promise<T>;
}

export function getSecretReferenceIds(...values: unknown[]) {
  const ids = new Set<string>();
  for (const value of values) {
    collectSecretReferenceIds(value, ids);
  }
  return [...ids];
}

export async function assertSecretReferencesOwnedByOrganization(
  value: unknown,
  organizationId: string,
) {
  const secretIds = getSecretReferenceIds(value);
  if (secretIds.length === 0) return;

  const ownedCount = await prisma.secret.count({
    where: {
      organizationId,
      secretId: { in: secretIds },
    },
  });
  if (ownedCount !== secretIds.length) {
    throw new Error("One or more secret references are unavailable");
  }
}

export async function deleteSecretReferences(
  organizationId: string,
  secretIds: readonly string[],
) {
  if (secretIds.length === 0) return;
  await prisma.secret.deleteMany({
    where: {
      organizationId,
      secretId: { in: [...new Set(secretIds)] },
    },
  });
}

export async function pruneScopedSecretReferences(args: {
  organizationId: string;
  namePrefixes: readonly string[];
  previousValues?: readonly unknown[];
  currentValues?: readonly unknown[];
}) {
  const keepIds = getSecretReferenceIds(...(args.currentValues ?? []));
  const staleIds = getSecretReferenceIds(...(args.previousValues ?? [])).filter(
    (secretId) => !keepIds.includes(secretId),
  );
  const scopedFilters = args.namePrefixes.map((prefix) => ({
    name: { startsWith: `${prefix}:` },
  }));
  if (staleIds.length === 0 && scopedFilters.length === 0) return;

  await prisma.secret.deleteMany({
    where: {
      organizationId: args.organizationId,
      ...(keepIds.length > 0 && { secretId: { notIn: keepIds } }),
      OR: [
        ...(staleIds.length > 0 ? [{ secretId: { in: staleIds } }] : []),
        ...scopedFilters,
      ],
    },
  });
}

async function visitSecretFields(
  value: unknown,
  context: SecretContext,
  path: string[],
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item, index) =>
        visitSecretFields(item, context, [...path, String(index)]),
      ),
    );
  }
  if (!isRecord(value)) return value;

  if (value.type === "Secret" && typeof value.value === "string") {
    if (isSecretReference(value.value) || isEncryptedSecretValue(value.value))
      return value;
    const reference = await createSecretReference(context, path, value.value);
    return { ...value, value: reference };
  }

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, item]) => [
      key,
      await visitSecretFields(item, context, [...path, key]),
    ]),
  );
  return Object.fromEntries(entries);
}

async function visitKeyValueFields(
  value: unknown,
  context: SecretContext,
  path: string[],
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item, index) =>
        visitKeyValueFields(item, context, [...path, String(index)]),
      ),
    );
  }
  if (!isRecord(value)) return value;

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, item]) => [
      key,
      await visitKeyValueFields(item, context, [...path, key]),
    ]),
  );
  const next = Object.fromEntries(entries);

  if (typeof next.key === "string" && typeof next.value === "string") {
    if (!isSecretReference(next.value) && !isEncryptedSecretValue(next.value)) {
      next.value = await createSecretReference(
        context,
        [...path, next.key],
        next.value,
      );
    }
  }

  return next;
}

async function resolveReferences(
  value: unknown,
  organizationId: string,
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => resolveReferences(item, organizationId)),
    );
  }
  if (typeof value === "string") {
    if (isSecretReference(value)) {
      return resolveSecretReference(value, organizationId);
    }
    if (isEncryptedSecretValue(value)) return decryptSecretValue(value);
    return value;
  }
  if (!isRecord(value)) return value;

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, item]) => [
      key,
      await resolveReferences(item, organizationId),
    ]),
  );
  return Object.fromEntries(entries);
}

async function createSecretReference(
  context: SecretContext,
  path: string[],
  secretValue: string,
) {
  const secret = await prisma.secret.create({
    data: {
      organizationId: context.organizationId,
      userId: context.userId ?? null,
      name: `${context.namePrefix}:${path.filter(Boolean).join(".")}:${randomUUID()}`,
      value: encryptSecretValue(secretValue),
    },
    select: { secretId: true },
  });
  context.createdSecretIds?.push(secret.secretId);
  return toSecretReference(secret.secretId);
}

async function resolveSecretReference(
  reference: string,
  organizationId: string,
) {
  const secret = await prisma.secret.findFirst({
    where: {
      secretId: secretIdFromReference(reference),
      organizationId,
    },
    select: { value: true },
  });
  if (!secret) {
    throw new Error("Referenced secret is unavailable");
  }
  return decryptSecretValue(secret.value);
}

function collectSecretReferenceIds(value: unknown, ids: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectSecretReferenceIds(item, ids);
    return;
  }
  if (typeof value === "string") {
    if (isSecretReference(value)) ids.add(secretIdFromReference(value));
    return;
  }
  if (!isRecord(value)) return;
  for (const item of Object.values(value)) {
    collectSecretReferenceIds(item, ids);
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
