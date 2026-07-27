export type PolicyScope = "deployment" | "organization" | "project" | "environment" | "agent" | "workflow" | "campaign" | "channel";
export type PolicyDecisionResult = "allow" | "deny" | "needs_confirmation";
export type RecordingMode = "disabled" | "disclosed_enabled" | "consent_gated" | "pause_sensitive" | "provider_unsupported";
export type DataClass = "recording" | "transcript" | "summary" | "extracted_field" | "tool_payload" | "metadata" | "analytics" | "audit" | "export" | "backup";

export type ComplianceRule = {
  ruleId: string;
  scope: PolicyScope;
  precedence: number;
  result: PolicyDecisionResult;
  reasonCode: string;
  conditions: Partial<{ direction: "inbound" | "outbound"; channel: string; jurisdiction: string; consent: "granted" | "missing" | "declined" | "withdrawn"; suppressed: boolean }>;
};

export type ContactPreflightInput = {
  direction: "inbound" | "outbound";
  channel: string;
  jurisdiction?: string;
  consent: "granted" | "missing" | "declined" | "withdrawn";
  suppressed?: boolean;
  localHour: number;
  quietHours?: { startHour: number; endHour: number };
};

export type RetentionSchedule = { dataClass: DataClass; retainDays: number };
export type LegalHold = { holdId: string; dataClasses: DataClass[]; resourceIds?: string[]; startsAt: string; endsAt?: string; releasedAt?: string };

export function evaluateContactPreflight(args: { policyVersionId: string; rules: ComplianceRule[]; input: ContactPreflightInput }) {
  const matched = args.rules
    .filter((rule) => matchesRule(rule, args.input))
    .sort((left, right) => right.precedence - left.precedence);
  const quietHour = args.input.direction === "outbound" && args.input.quietHours && isQuietHour(args.input.localHour, args.input.quietHours);
  if (quietHour) {
    return { policyVersionId: args.policyVersionId, result: "deny" as const, reasonCodes: ["quiet_hours"], matchedRuleIds: matched.map((rule) => rule.ruleId) };
  }
  if (args.input.consent === "declined" || args.input.consent === "withdrawn") {
    return { policyVersionId: args.policyVersionId, result: "deny" as const, reasonCodes: [`consent_${args.input.consent}`], matchedRuleIds: matched.map((rule) => rule.ruleId) };
  }
  if (args.input.suppressed) {
    return { policyVersionId: args.policyVersionId, result: "deny" as const, reasonCodes: ["suppressed"], matchedRuleIds: matched.map((rule) => rule.ruleId) };
  }
  const top = matched[0];
  return top
    ? { policyVersionId: args.policyVersionId, result: top.result, reasonCodes: [top.reasonCode], matchedRuleIds: matched.map((rule) => rule.ruleId) }
    : { policyVersionId: args.policyVersionId, result: args.input.consent === "missing" ? "needs_confirmation" as const : "allow" as const, reasonCodes: args.input.consent === "missing" ? ["consent_required"] : ["default_allow"], matchedRuleIds: [] };
}

export function decideRecording(mode: RecordingMode, consent: "granted" | "missing" | "declined" | "withdrawn", disclosureDelivered: boolean) {
  if (mode === "disabled") return { record: false, reason: "recording_disabled" as const };
  if (mode === "provider_unsupported") return { record: false, reason: "provider_unsupported" as const };
  if (!disclosureDelivered) return { record: false, reason: "disclosure_not_delivered" as const };
  if (mode === "consent_gated" && consent !== "granted") return { record: false, reason: "consent_required" as const };
  return { record: true, reason: mode === "pause_sensitive" ? "record_with_sensitive_pause" as const : "record_allowed" as const };
}

export function calculateRetentionEligibility(args: { createdAt: string; dataClass: DataClass; schedules: RetentionSchedule[]; holds: LegalHold[]; resourceId?: string; now: string }) {
  const schedule = args.schedules.find((item) => item.dataClass === args.dataClass);
  if (!schedule) return { eligible: false, reason: "no_schedule" as const, eligibleAt: null, blockingHoldIds: [] };
  const eligibleAt = new Date(args.createdAt);
  eligibleAt.setUTCDate(eligibleAt.getUTCDate() + schedule.retainDays);
  const blockingHolds = args.holds.filter((hold) => !hold.releasedAt && hold.dataClasses.includes(args.dataClass) && (!hold.endsAt || new Date(hold.endsAt) > new Date(args.now)) && (!hold.resourceIds?.length || (args.resourceId && hold.resourceIds.includes(args.resourceId))));
  if (blockingHolds.length > 0) return { eligible: false, reason: "legal_hold" as const, eligibleAt: eligibleAt.toISOString(), blockingHoldIds: blockingHolds.map((hold) => hold.holdId).sort() };
  return { eligible: new Date(args.now) >= eligibleAt, reason: new Date(args.now) >= eligibleAt ? "eligible" as const : "retention_active" as const, eligibleAt: eligibleAt.toISOString(), blockingHoldIds: [] };
}

export function buildDeletionReceipt(args: { jobId: string; policyVersionId: string; storeResults: Array<{ store: string; deletedCount: number; skippedCount: number; reasonCodes: string[] }> }) {
  return {
    jobId: args.jobId,
    policyVersionId: args.policyVersionId,
    totals: args.storeResults.reduce((totals, store) => ({ deletedCount: totals.deletedCount + store.deletedCount, skippedCount: totals.skippedCount + store.skippedCount }), { deletedCount: 0, skippedCount: 0 }),
    stores: args.storeResults.map((store) => ({ store: store.store, deletedCount: store.deletedCount, skippedCount: store.skippedCount, reasonCodes: [...new Set(store.reasonCodes)].sort() })),
  };
}

function matchesRule(rule: ComplianceRule, input: ContactPreflightInput) {
  return Object.entries(rule.conditions).every(([key, expected]) => (input as unknown as Record<string, unknown>)[key] === expected);
}

function isQuietHour(hour: number, quietHours: NonNullable<ContactPreflightInput["quietHours"]>) {
  if (quietHours.startHour === quietHours.endHour) return false;
  if (quietHours.startHour < quietHours.endHour) return hour >= quietHours.startHour && hour < quietHours.endHour;
  return hour >= quietHours.startHour || hour < quietHours.endHour;
}
