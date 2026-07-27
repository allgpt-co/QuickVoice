export type CampaignRunState = "draft" | "validating" | "ready" | "scheduled" | "running" | "pausing" | "paused" | "completing" | "completed" | "cancelling" | "cancelled" | "failed" | "archived";
export type RecipientAttemptState = "pending" | "deferred" | "eligible" | "dispatching" | "in_progress" | "succeeded" | "retry_scheduled" | "skipped_suppressed" | "cancelled" | "failed" | "unknown_needs_reconciliation";
export type CampaignControlCommand = "validate" | "mark_ready" | "schedule" | "start" | "pause" | "paused" | "resume" | "complete" | "cancel" | "cancelled" | "fail" | "archive";

export type RetryPolicy = {
  retryableReasons: string[];
  neverRetryReasons: string[];
  maxAttempts: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  jitterSeconds: number;
};

export type DispatchPreflightDecision = {
  contactabilityAllowed: boolean;
  localWindowAllowed: boolean;
  frequencyAllowed: boolean;
  quotaAllowed: boolean;
  providerAllowed: boolean;
  numberCapacityAllowed: boolean;
  policyVersionId: string;
};

const CAMPAIGN_TRANSITIONS: Record<CampaignRunState, Partial<Record<CampaignControlCommand, CampaignRunState>>> = {
  draft: { validate: "validating", cancel: "cancelling", archive: "archived" },
  validating: { mark_ready: "ready", fail: "failed", cancel: "cancelling" },
  ready: { schedule: "scheduled", start: "running", cancel: "cancelling" },
  scheduled: { start: "running", cancel: "cancelling" },
  running: { pause: "pausing", complete: "completing", cancel: "cancelling", fail: "failed" },
  pausing: { paused: "paused", cancel: "cancelling", fail: "failed" },
  paused: { resume: "running", cancel: "cancelling" },
  completing: { complete: "completed", fail: "failed" },
  completed: { archive: "archived" },
  cancelling: { cancelled: "cancelled", fail: "failed" },
  cancelled: { archive: "archived" },
  failed: { archive: "archived" },
  archived: {},
};

const RECIPIENT_TERMINAL_STATES = new Set<RecipientAttemptState>(["succeeded", "skipped_suppressed", "cancelled", "failed"]);

export function transitionCampaignRun(current: CampaignRunState, command: CampaignControlCommand): CampaignRunState {
  const next = CAMPAIGN_TRANSITIONS[current][command];
  if (next) return next;
  if (current === "archived") return current;
  throw new Error(`campaign command ${command} is invalid from ${current}`);
}

export function transitionRecipientAttempt(current: RecipientAttemptState, next: RecipientAttemptState): RecipientAttemptState {
  if (current === next) return current;
  if (RECIPIENT_TERMINAL_STATES.has(current)) return current;
  const allowed: Record<RecipientAttemptState, RecipientAttemptState[]> = {
    pending: ["deferred", "eligible", "skipped_suppressed", "cancelled"],
    deferred: ["eligible", "skipped_suppressed", "cancelled"],
    eligible: ["dispatching", "skipped_suppressed", "cancelled"],
    dispatching: ["in_progress", "unknown_needs_reconciliation", "failed", "cancelled"],
    in_progress: ["succeeded", "retry_scheduled", "failed", "unknown_needs_reconciliation"],
    retry_scheduled: ["eligible", "skipped_suppressed", "cancelled"],
    unknown_needs_reconciliation: ["in_progress", "succeeded", "failed", "cancelled"],
    skipped_suppressed: [],
    cancelled: [],
    failed: [],
    succeeded: [],
  };
  if (!allowed[current].includes(next)) throw new Error(`recipient attempt cannot transition from ${current} to ${next}`);
  return next;
}

export function buildDispatchIdempotencyKey(args: { campaignRunId: string; recipientRunId: string; attemptNumber: number }) {
  return `${args.campaignRunId}:${args.recipientRunId}:attempt:${args.attemptNumber}`;
}

export function evaluateDispatchPreflight(decision: DispatchPreflightDecision) {
  const reasons: string[] = [];
  if (!decision.contactabilityAllowed) reasons.push("contactability_denied");
  if (!decision.localWindowAllowed) reasons.push("outside_recipient_window");
  if (!decision.frequencyAllowed) reasons.push("frequency_cap");
  if (!decision.quotaAllowed) reasons.push("quota_exhausted");
  if (!decision.providerAllowed) reasons.push("provider_limited");
  if (!decision.numberCapacityAllowed) reasons.push("number_capacity_limited");
  return { allowed: reasons.length === 0, policyVersionId: decision.policyVersionId, reasons: reasons.length === 0 ? ["eligible"] : reasons };
}

export function nextRetryDelaySeconds(policy: RetryPolicy, args: { attemptNumber: number; reason: string }) {
  if (policy.neverRetryReasons.includes(args.reason)) return { retry: false, reason: "never_retry" as const };
  if (!policy.retryableReasons.includes(args.reason)) return { retry: false, reason: "reason_not_retryable" as const };
  if (args.attemptNumber >= policy.maxAttempts) return { retry: false, reason: "max_attempts" as const };
  const exponential = Math.min(policy.maxIntervalSeconds, policy.minIntervalSeconds * 2 ** Math.max(0, args.attemptNumber - 1));
  const jitter = policy.jitterSeconds === 0 ? 0 : (args.attemptNumber * 113) % policy.jitterSeconds;
  return { retry: true, reason: "retry_scheduled" as const, delaySeconds: exponential + jitter };
}
