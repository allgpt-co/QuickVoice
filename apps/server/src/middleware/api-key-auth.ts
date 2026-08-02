import { UnauthenticatedError } from "../common/errors/unauthenticated.js";

/**
 * Organization API keys intentionally cannot manage billing. Money-moving
 * routes also reject API-key auth independently, even if a database row is
 * ever misconfigured with a broader statement.
 */
export const ORGANIZATION_API_KEY_PERMISSIONS: Record<string, string[]> = {
  agent: ["read"],
  agentConfiguration: ["read"],
  agentWidget: ["read"],
  phoneNumber: ["read"],
  knowledgeSource: ["read"],
  callLogs: ["read"],
  outboundCalls: ["read"],
  campaigns: ["read"],
  tools: ["read"],
  billing: ["read"],
};

export type VerifiedOrganizationApiKey = {
  id?: string | null;
  configId?: string | null;
  referenceId?: string | null;
  permissions?: unknown;
  // Metadata and userId may be present in legacy/plugin return objects. They
  // are deliberately absent from every trust decision below.
  metadata?: unknown;
  userId?: string | null;
};

export async function resolveOrganizationApiKeyAuth(args: {
  key: VerifiedOrganizationApiKey;
  findOrganizationPrincipal: (organizationId: string) => Promise<string | null>;
}) {
  const apiKeyId = nonEmptyString(args.key.id);
  const organizationId = nonEmptyString(args.key.referenceId);
  if (!apiKeyId || !organizationId) {
    throw new UnauthenticatedError(
      "API key is missing its server-owned organization reference",
    );
  }

  const userId = await args.findOrganizationPrincipal(organizationId);
  if (!userId) {
    throw new UnauthenticatedError(
      "API key organization no longer has an authorized principal",
    );
  }

  return {
    apiKeyId,
    organizationId,
    userId,
    permissions: normalizeServerApiKeyPermissions(args.key.permissions),
  };
}

/**
 * Better Auth's top-level permission field is server-only for browser/API
 * creation requests. Still intersect it with this deployment allowlist so a
 * malformed legacy row can only lose authority, never gain it.
 */
export function normalizeServerApiKeyPermissions(
  value: unknown,
): Record<string, string[]> | undefined {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  const permissions: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(parsed)) {
    const allowed = ORGANIZATION_API_KEY_PERMISSIONS[resource];
    if (!allowed || !Array.isArray(actions)) continue;
    const normalized = [
      ...new Set(
        actions.filter(
          (action): action is string =>
            typeof action === "string" && allowed.includes(action),
        ),
      ),
    ];
    if (normalized.length > 0) permissions[resource] = normalized;
  }
  return Object.keys(permissions).length > 0 ? permissions : undefined;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
