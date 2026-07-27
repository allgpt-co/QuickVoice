import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDelegatedAuditContext,
  isDelegatedAccessActive,
  validatePartnerBranding,
} from "../../src/modules/partners/partner-policy.js";

test("delegated partner audit context preserves partner and client boundaries", () => {
  const context = buildDelegatedAuditContext({
    partnerOrganizationId: "org_partner",
    clientOrganizationId: "org_client",
    actorUserId: "user_support",
    reason: "client requested troubleshooting",
    scope: ["partner_support", "partner_health_reader"],
    expiresAt: "2026-07-26T12:00:00.000Z",
  });

  assert.deepEqual(context, {
    partnerOrganizationId: "org_partner",
    clientOrganizationId: "org_client",
    actorUserId: "user_support",
    reason: "client requested troubleshooting",
    scope: ["partner_health_reader", "partner_support"],
    expiresAt: "2026-07-26T12:00:00.000Z",
  });
  assert.throws(
    () =>
      buildDelegatedAuditContext({
        partnerOrganizationId: "org_same",
        clientOrganizationId: "org_same",
        actorUserId: "user_support",
        reason: "support",
        scope: ["partner_support"],
      }),
    /must be different/,
  );
});

test("delegated support access stops on suspension, revocation, or expiry", () => {
  const now = new Date("2026-07-26T10:00:00.000Z");

  assert.equal(isDelegatedAccessActive({ state: "active", expiresAt: "2026-07-26T10:01:00.000Z", now }), true);
  assert.equal(isDelegatedAccessActive({ state: "active", expiresAt: "2026-07-26T09:59:00.000Z", now }), false);
  assert.equal(isDelegatedAccessActive({ state: "suspended", expiresAt: "2026-07-26T10:01:00.000Z", now }), false);
  assert.equal(isDelegatedAccessActive({ state: "revoked", now }), false);
});

test("partner branding must keep accessible contrast and mandatory system notices", () => {
  assert.deepEqual(
    validatePartnerBranding({
      foreground: "#111827",
      background: "#FFFFFF",
      preservedNoticeSurfaces: ["security", "consent", "provider", "incident"],
    }),
    { valid: true, errors: [], contrastRatio: 17.74 },
  );

  const unsafe = validatePartnerBranding({
    foreground: "#94A3B8",
    background: "#FFFFFF",
    preservedNoticeSurfaces: ["security"],
  });
  assert.equal(unsafe.valid, false);
  assert.ok(unsafe.errors.some((error) => error.includes("WCAG AA")));
  assert.ok(unsafe.errors.some((error) => error.includes("mandatory consent")));
});
