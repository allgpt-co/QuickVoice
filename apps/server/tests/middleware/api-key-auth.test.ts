import assert from "node:assert/strict";
import { test } from "node:test";

import { UnauthenticatedError } from "../../src/common/errors/unauthenticated.js";
import {
  normalizeServerApiKeyPermissions,
  resolveOrganizationApiKeyAuth,
} from "../../src/middleware/api-key-auth.js";

test("client metadata cannot select another tenant, actor, or permissions", async () => {
  const lookedUpOrganizations: string[] = [];
  const resolved = await resolveOrganizationApiKeyAuth({
    key: {
      id: "key_org_a",
      referenceId: "org_a",
      userId: "attacker",
      metadata: {
        organizationId: "org_b",
        userId: "attacker",
        permissions: { "*": ["*"] },
      },
      permissions: {
        agent: ["read", "delete"],
        billing: ["read", "manage"],
        secrets: ["read"],
        "*": ["*"],
      },
    },
    findOrganizationPrincipal: async (organizationId) => {
      lookedUpOrganizations.push(organizationId);
      return "server_selected_org_a_owner";
    },
  });

  assert.deepEqual(lookedUpOrganizations, ["org_a"]);
  assert.equal(resolved.organizationId, "org_a");
  assert.equal(resolved.userId, "server_selected_org_a_owner");
  assert.deepEqual(resolved.permissions, {
    agent: ["read"],
    billing: ["read"],
  });
});

test("a legitimate organization key retains only its server-issued read scopes", async () => {
  const resolved = await resolveOrganizationApiKeyAuth({
    key: {
      id: "key_legitimate",
      referenceId: "org_legitimate",
      permissions: JSON.stringify({
        agent: ["read"],
        phoneNumber: ["read"],
        callLogs: ["read"],
      }),
    },
    findOrganizationPrincipal: async () => "owner_legitimate",
  });

  assert.deepEqual(resolved, {
    apiKeyId: "key_legitimate",
    organizationId: "org_legitimate",
    userId: "owner_legitimate",
    permissions: {
      agent: ["read"],
      phoneNumber: ["read"],
      callLogs: ["read"],
    },
  });
});

test("keys cannot authenticate after their organization loses an authorized principal", async () => {
  await assert.rejects(
    resolveOrganizationApiKeyAuth({
      key: {
        id: "key_orphaned",
        referenceId: "org_without_owner_or_admin",
        permissions: { agent: ["read"] },
      },
      findOrganizationPrincipal: async () => null,
    }),
    (error: unknown) => error instanceof UnauthenticatedError,
  );
});

test("malformed and wildcard top-level scopes fail closed", () => {
  assert.equal(normalizeServerApiKeyPermissions("not-json"), undefined);
  assert.equal(
    normalizeServerApiKeyPermissions({ "*": ["*"], billing: ["manage"] }),
    undefined,
  );
});
