import { createHash } from "node:crypto";

export type ChannelKind = "web" | "ios" | "android" | "phone";
export type ChannelSessionState = "connect" | "ready" | "listening" | "thinking" | "speaking" | "reconnecting" | "held" | "muted" | "degraded" | "ended" | "failed";
export type CallControlKind = "mute" | "unmute" | "hold" | "resume" | "interrupt" | "end" | "set_volume" | "select_device" | "send_dtmf" | "request_callback" | "request_handoff";
export type ChannelReasonCode = "ok" | "permission_denied" | "token_expired" | "identity_mismatch" | "unsupported_capability" | "network_lost" | "provider_failed" | "policy_denied";

export type SessionTokenScope = {
  organizationId: string;
  agentId: string;
  environmentId?: string;
  channel: ChannelKind;
  allowedOrigins?: string[];
  allowedAppIds?: string[];
  expiresAt: string;
  revokedAt?: string;
};

export type ChannelControlCommand = {
  commandId?: string;
  sessionId: string;
  organizationId: string;
  kind: CallControlKind;
  value?: string | number | boolean;
  idempotencyKey: string;
};

export type WidgetThemeConfig = {
  launcherLabel: string;
  placement: "bottom-right" | "bottom-left" | "inline";
  primaryColor: string;
  disclosureText: string;
  language: string;
  logoUrl?: string;
  customCss?: string;
};

export type SmsFollowUpRequest = {
  organizationId: string;
  templateId: string;
  consentSource: string;
  timezone: string;
  localHour: number;
  quietHours: { startHour: number; endHour: number };
  suppressed: boolean;
};

const VALID_TRANSITIONS: Record<ChannelSessionState, ChannelSessionState[]> = {
  connect: ["ready", "failed"],
  ready: ["listening", "reconnecting", "ended", "failed"],
  listening: ["thinking", "muted", "held", "reconnecting", "ended", "failed"],
  thinking: ["speaking", "listening", "reconnecting", "ended", "failed"],
  speaking: ["listening", "muted", "held", "reconnecting", "ended", "failed"],
  reconnecting: ["ready", "degraded", "ended", "failed"],
  held: ["listening", "ended", "failed"],
  muted: ["listening", "held", "ended", "failed"],
  degraded: ["ready", "ended", "failed"],
  ended: [],
  failed: [],
};

const DTMF_PATTERN = /^[0-9*#ABCDpw,]+$/i;
const SAFE_HEX = /^#[0-9a-f]{6}$/i;
const UNSAFE_STYLE = /<\/?style|<\/?script|javascript:|expression\(|url\(/i;

export function validateSessionTokenScope(scope: SessionTokenScope, request: { organizationId: string; agentId: string; channel: ChannelKind; origin?: string; appId?: string; now: string }) {
  const issues: string[] = [];
  if (scope.organizationId !== request.organizationId) issues.push("token organization mismatch");
  if (scope.agentId !== request.agentId) issues.push("token agent mismatch");
  if (scope.channel !== request.channel) issues.push("token channel mismatch");
  if (new Date(scope.expiresAt) <= new Date(request.now)) issues.push("token expired");
  if (scope.revokedAt) issues.push("token revoked");
  if (request.origin && scope.allowedOrigins?.length && !scope.allowedOrigins.includes(request.origin)) issues.push("origin not allowed");
  if (request.appId && scope.allowedAppIds?.length && !scope.allowedAppIds.includes(request.appId)) issues.push("app id not allowed");
  return issues;
}

export function transitionChannelSession(current: ChannelSessionState, next: ChannelSessionState): ChannelSessionState {
  if (current === next) return current;
  if (!VALID_TRANSITIONS[current].includes(next)) throw new Error(`channel state ${current} cannot transition to ${next}`);
  return next;
}

export function buildIdempotentControlCommand(command: ChannelControlCommand) {
  if (!command.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  if (command.kind === "send_dtmf") validateDtmf(String(command.value ?? ""));
  return {
    ...command,
    commandId: command.commandId ?? `ctrl_${createHash("sha256").update(`${command.organizationId}:${command.sessionId}:${command.kind}:${command.idempotencyKey}`).digest("hex").slice(0, 16)}`,
    telemetryValue: command.kind === "send_dtmf" ? redactDtmf(String(command.value ?? "")) : command.value,
  };
}

export function validateWidgetTheme(config: WidgetThemeConfig): string[] {
  const issues: string[] = [];
  if (!config.launcherLabel.trim()) issues.push("launcher label is required");
  if (!SAFE_HEX.test(config.primaryColor)) issues.push("primary color must be a six-digit hex color");
  if (!config.disclosureText.trim()) issues.push("disclosure text is required");
  if (config.customCss && UNSAFE_STYLE.test(config.customCss)) issues.push("custom CSS contains unsafe script/style content");
  if (config.logoUrl && !config.logoUrl.startsWith("https://")) issues.push("logo URL must use https");
  return issues;
}

export function decideSmsFollowUp(request: SmsFollowUpRequest) {
  if (!request.templateId.trim()) return { allowed: false, reason: "missing_template" as const };
  if (!request.consentSource.trim()) return { allowed: false, reason: "missing_consent" as const };
  if (request.suppressed) return { allowed: false, reason: "suppressed" as const };
  if (isQuietHour(request.localHour, request.quietHours)) return { allowed: false, reason: "quiet_hours" as const };
  return { allowed: true, reason: "allowed" as const };
}

function validateDtmf(value: string) {
  if (!DTMF_PATTERN.test(value)) throw new Error("DTMF can contain only digits, *, #, A-D, pauses, and waits");
}

function redactDtmf(value: string) {
  return value.replace(/[0-9ABCD]/gi, "•");
}

function isQuietHour(hour: number, quietHours: SmsFollowUpRequest["quietHours"]) {
  if (quietHours.startHour === quietHours.endHour) return false;
  if (quietHours.startHour < quietHours.endHour) return hour >= quietHours.startHour && hour < quietHours.endHour;
  return hour >= quietHours.startHour || hour < quietHours.endHour;
}
