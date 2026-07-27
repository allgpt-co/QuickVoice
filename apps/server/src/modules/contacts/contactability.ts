export type ConsentStatus = "granted" | "missing" | "revoked" | "expired";
export type SuppressionLevel = "customer" | "channel" | "organization" | "provider" | "legal";
export type ContactabilityReason = "invalid_channel" | "missing_timezone" | "quiet_hours" | "consent_not_granted" | "suppressed" | "frequency_cap" | "quota_exceeded" | "provider_restricted" | "allowed";

export type CustomerChannel = {
  channelId: string;
  type: "phone" | "email";
  value: string;
  normalized?: string;
  valid: boolean;
};

export type ConsentEvidence = {
  channelId: string;
  purpose: string;
  status: ConsentStatus;
  source: string;
  capturedAt: string;
  expiresAt?: string;
};

export type SuppressionEntry = {
  level: SuppressionLevel;
  channelId?: string;
  purpose?: string;
  reason: string;
  startsAt: string;
  endsAt?: string;
};

export type ContactabilityInput = {
  policyVersionId: string;
  channel: CustomerChannel;
  purpose: string;
  timezone?: string;
  localHour: number;
  quietHours: { startHour: number; endHour: number };
  consents: ConsentEvidence[];
  suppressions: SuppressionEntry[];
  attemptsInWindow: number;
  maxAttemptsInWindow: number;
  organizationQuotaRemaining: number;
  providerRestricted?: boolean;
};

export function normalizePhoneForDispatch(raw: string, countryCode = "1") {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+${countryCode}${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function buildDedupeKey(args: { organizationId: string; source?: string; externalId?: string; channel?: CustomerChannel }) {
  if (args.source && args.externalId) return `${args.organizationId}:external:${args.source}:${args.externalId}`;
  if (args.channel?.normalized) return `${args.organizationId}:channel:${args.channel.type}:${args.channel.normalized}`;
  throw new Error("dedupe key requires source/externalId or normalized channel");
}

export function evaluateContactability(input: ContactabilityInput) {
  const reasons: ContactabilityReason[] = [];
  if (!input.channel.valid || !input.channel.normalized) reasons.push("invalid_channel");
  if (!input.timezone) reasons.push("missing_timezone");
  if (isQuietHour(input.localHour, input.quietHours)) reasons.push("quiet_hours");
  const consent = input.consents.find((item) => item.channelId === input.channel.channelId && item.purpose === input.purpose);
  if (!consent || consent.status !== "granted" || (consent.expiresAt && new Date(consent.expiresAt) <= new Date())) reasons.push("consent_not_granted");
  if (input.suppressions.some((entry) => suppressionApplies(entry, input.channel.channelId, input.purpose))) reasons.push("suppressed");
  if (input.attemptsInWindow >= input.maxAttemptsInWindow) reasons.push("frequency_cap");
  if (input.organizationQuotaRemaining <= 0) reasons.push("quota_exceeded");
  if (input.providerRestricted) reasons.push("provider_restricted");

  return {
    policyVersionId: input.policyVersionId,
    allowed: reasons.length === 0,
    reasons: reasons.length === 0 ? ["allowed" as const] : reasons,
  };
}

export function escapeSpreadsheetCell(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function suppressionApplies(entry: SuppressionEntry, channelId: string, purpose: string) {
  const now = new Date();
  if (new Date(entry.startsAt) > now) return false;
  if (entry.endsAt && new Date(entry.endsAt) <= now) return false;
  return (!entry.channelId || entry.channelId === channelId) && (!entry.purpose || entry.purpose === purpose);
}

function isQuietHour(hour: number, quietHours: ContactabilityInput["quietHours"]) {
  if (quietHours.startHour === quietHours.endHour) return false;
  if (quietHours.startHour < quietHours.endHour) return hour >= quietHours.startHour && hour < quietHours.endHour;
  return hour >= quietHours.startHour || hour < quietHours.endHour;
}
