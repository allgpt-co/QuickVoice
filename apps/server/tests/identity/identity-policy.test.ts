import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDomainVerificationStatus,
  mapScimGroupsToRoles,
  validateSessionPolicy,
  validateSsoEnforcement,
} from "../../src/modules/identity/identity-policy.js";

test("SSO enforcement requires safe metadata, tested signed login, verified domain, recovery admin, and active keys", () => {
  assert.deepEqual(validateSsoEnforcement({ providerId: "idp_1", organizationId: "org_1", protocol: "oidc", state: "enforced", issuer: "https://idp.example.com", audience: "quickvoice", redirectUrl: "https://console.quickvoice.co/callback", signedLoginTestAt: "2026-07-26T00:00:00.000Z", domainVerified: true, recoveryAdminUserId: "user_1", activeKeyIds: ["key_1"] }), []);
  assert.deepEqual(validateSsoEnforcement({ providerId: "idp_1", organizationId: "org_1", protocol: "saml", state: "enforced", issuer: "http://127.0.0.1/idp", audience: "", redirectUrl: "https://localhost/callback", domainVerified: false, activeKeyIds: [] }), [
    "audience is required",
    "identity provider URLs must not target private or insecure hosts",
    "at least one signing/JWKS key is required",
    "enforcement requires a successful signed login test",
    "enforcement requires a verified domain",
    "enforcement requires a verified recovery admin",
  ]);
});

test("SCIM group mapping grants only roles delegated by configured mappings and marks deletes disabled", () => {
  assert.deepEqual(mapScimGroupsToRoles({ operationId: "op_1", organizationId: "org_1", externalId: "ext_1", action: "delete", idempotencyKey: "idem", groupIds: ["sales"], requestedRoleIds: ["agent_admin", "owner"] }, [{ idpGroupId: "sales", roleIds: ["agent_admin"], delegatedRoleIds: [] }]), {
    externalId: "ext_1",
    grantedRoleIds: ["agent_admin"],
    deniedRoleIds: ["owner"],
    disabled: true,
  });
});

test("session policy constrains duration, concurrency, recent auth, and break-glass windows", () => {
  assert.deepEqual(validateSessionPolicy({ absoluteMinutes: 480, idleMinutes: 60, maxConcurrentSessions: 5, requireRecentAuthForHighRisk: true, breakGlassMaxMinutes: 30 }), []);
  assert.deepEqual(validateSessionPolicy({ absoluteMinutes: 10, idleMinutes: 20, maxConcurrentSessions: 0, requireRecentAuthForHighRisk: true, breakGlassMaxMinutes: 120 }), [
    "absolute session duration must be between 15 and 1440 minutes",
    "idle session duration must be at least 5 minutes and no greater than absolute duration",
    "max concurrent sessions must be between 1 and 50",
    "break-glass sessions must be short lived",
  ]);
});

test("domain verification messages avoid leaking other tenant membership", () => {
  assert.deepEqual(buildDomainVerificationStatus({ domain: "example.com", state: "conflict", proofMatches: false, claimedByCurrentOrg: false }), { status: "conflict", safeMessage: "Domain ownership needs administrator review." });
});
