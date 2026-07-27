import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDedupeKey,
  escapeSpreadsheetCell,
  evaluateContactability,
  normalizePhoneForDispatch,
} from "../../src/modules/contacts/contactability.js";

test("contact channels normalize to E.164 only when explicit country context produces a valid number", () => {
  assert.equal(normalizePhoneForDispatch("(415) 555-0100", "1"), "+14155550100");
  assert.equal(normalizePhoneForDispatch("+91 98765 43210"), "+919876543210");
  assert.equal(normalizePhoneForDispatch("123"), null);
});

test("customer dedupe keys prefer source external IDs and otherwise use normalized channels", () => {
  assert.equal(buildDedupeKey({ organizationId: "org_1", source: "crm", externalId: "123" }), "org_1:external:crm:123");
  assert.equal(buildDedupeKey({ organizationId: "org_1", channel: { channelId: "ch_1", type: "phone", value: "415", normalized: "+14155550100", valid: true } }), "org_1:channel:phone:+14155550100");
  assert.throws(() => buildDedupeKey({ organizationId: "org_1" }), /dedupe key/);
});

test("contactability fails closed for invalid channel, missing timezone, consent, suppression, quiet hours, caps, quota, and provider limits", () => {
  const channel = { channelId: "ch_1", type: "phone" as const, value: "4155550100", normalized: "+14155550100", valid: true };
  assert.deepEqual(evaluateContactability({
    policyVersionId: "polv_1",
    channel,
    purpose: "sales",
    timezone: "America/Chicago",
    localHour: 14,
    quietHours: { startHour: 21, endHour: 8 },
    consents: [{ channelId: "ch_1", purpose: "sales", status: "granted", source: "form", capturedAt: "2026-07-26T00:00:00.000Z" }],
    suppressions: [],
    attemptsInWindow: 0,
    maxAttemptsInWindow: 3,
    organizationQuotaRemaining: 1,
  }), { policyVersionId: "polv_1", allowed: true, reasons: ["allowed"] });

  assert.deepEqual(evaluateContactability({
    policyVersionId: "polv_1",
    channel: { ...channel, valid: false, normalized: undefined },
    purpose: "sales",
    localHour: 22,
    quietHours: { startHour: 21, endHour: 8 },
    consents: [],
    suppressions: [{ level: "organization", reason: "DNC", startsAt: "2020-01-01T00:00:00.000Z" }],
    attemptsInWindow: 3,
    maxAttemptsInWindow: 3,
    organizationQuotaRemaining: 0,
    providerRestricted: true,
  }).reasons, ["invalid_channel", "missing_timezone", "quiet_hours", "consent_not_granted", "suppressed", "frequency_cap", "quota_exceeded", "provider_restricted"]);
});

test("CSV exports protect against spreadsheet formula injection", () => {
  assert.equal(escapeSpreadsheetCell("=IMPORTXML('x')"), "'=IMPORTXML('x')");
  assert.equal(escapeSpreadsheetCell("normal"), "normal");
});
