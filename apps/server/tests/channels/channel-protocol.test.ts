import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildIdempotentControlCommand,
  decideSmsFollowUp,
  transitionChannelSession,
  validateSessionTokenScope,
  validateWidgetTheme,
} from "../../src/modules/channels/channel-protocol.js";

test("channel tokens are scoped by tenant, agent, channel, origin/app, expiry, and revocation", () => {
  assert.deepEqual(validateSessionTokenScope({ organizationId: "org_1", agentId: "agent_1", channel: "web", allowedOrigins: ["https://app.example.com"], expiresAt: "2026-07-26T10:00:00.000Z" }, { organizationId: "org_1", agentId: "agent_1", channel: "web", origin: "https://app.example.com", now: "2026-07-26T09:00:00.000Z" }), []);
  assert.deepEqual(validateSessionTokenScope({ organizationId: "org_1", agentId: "agent_1", channel: "web", allowedOrigins: ["https://app.example.com"], expiresAt: "2026-07-26T08:00:00.000Z", revokedAt: "2026-07-26T07:00:00.000Z" }, { organizationId: "org_2", agentId: "agent_2", channel: "ios", origin: "https://evil.example.com", now: "2026-07-26T09:00:00.000Z" }), ["token organization mismatch", "token agent mismatch", "token channel mismatch", "token expired", "token revoked", "origin not allowed"]);
});

test("channel session lifecycle has stable transitions and terminal states", () => {
  assert.equal(transitionChannelSession("connect", "ready"), "ready");
  assert.equal(transitionChannelSession("ready", "listening"), "listening");
  assert.equal(transitionChannelSession("listening", "muted"), "muted");
  assert.equal(transitionChannelSession("muted", "held"), "held");
  assert.throws(() => transitionChannelSession("ended", "ready"), /cannot transition/);
});

test("call controls are idempotent and redact DTMF digits from telemetry", () => {
  const first = buildIdempotentControlCommand({ sessionId: "sess_1", organizationId: "org_1", kind: "send_dtmf", value: "1234#", idempotencyKey: "idem" });
  const second = buildIdempotentControlCommand({ sessionId: "sess_1", organizationId: "org_1", kind: "send_dtmf", value: "1234#", idempotencyKey: "idem" });

  assert.equal(second.commandId, first.commandId);
  assert.equal(first.telemetryValue, "••••#");
  assert.throws(() => buildIdempotentControlCommand({ sessionId: "sess_1", organizationId: "org_1", kind: "send_dtmf", value: "12X", idempotencyKey: "idem" }), /DTMF/);
});

test("widget theme validation allows safe brand tokens and rejects arbitrary script/style injection", () => {
  assert.deepEqual(validateWidgetTheme({ launcherLabel: "Talk to us", placement: "bottom-right", primaryColor: "#2563EB", disclosureText: "Calls may be recorded.", language: "en-US", logoUrl: "https://example.com/logo.svg" }), []);
  assert.deepEqual(validateWidgetTheme({ launcherLabel: "", placement: "inline", primaryColor: "blue", disclosureText: "", language: "en-US", logoUrl: "http://example.com/logo.svg", customCss: "body{background:url(javascript:alert(1))}" }), ["launcher label is required", "primary color must be a six-digit hex color", "disclosure text is required", "custom CSS contains unsafe script/style content", "logo URL must use https"]);
});

test("SMS follow-up requires template, consent, suppression, and quiet-hours decisions", () => {
  const base = { organizationId: "org_1", templateId: "sms_1", consentSource: "call_opt_in", timezone: "America/Chicago", localHour: 14, quietHours: { startHour: 21, endHour: 8 }, suppressed: false };
  assert.deepEqual(decideSmsFollowUp(base), { allowed: true, reason: "allowed" });
  assert.deepEqual(decideSmsFollowUp({ ...base, suppressed: true }), { allowed: false, reason: "suppressed" });
  assert.deepEqual(decideSmsFollowUp({ ...base, localHour: 22 }), { allowed: false, reason: "quiet_hours" });
});
