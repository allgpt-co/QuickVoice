import { createHash } from "node:crypto";

export type AnswerClassification = "human" | "machine_start" | "machine_end_beep" | "fax" | "silence" | "no_answer" | "busy" | "invalid_unreachable" | "unknown" | "provider_error";
export type OutcomeAction = "start_agent" | "continue_detecting" | "wait_for_beep" | "drop_voicemail" | "hang_up" | "schedule_retry" | "create_callback" | "transfer" | "mark_terminal";
export type CallbackStatus = "requested" | "assigned" | "scheduled" | "completed" | "cancelled" | "missed" | "expired";

export type ClassificationEvidence = {
  provider: string;
  rawValue: string;
  confidence?: number;
  observedAt: string;
};

export type AmdPolicy = {
  mode: "disabled" | "synchronous" | "asynchronous" | "platform_assisted";
  unknownAction: OutcomeAction;
  machineStartAction: OutcomeAction;
  beepAction: OutcomeAction;
  humanAction: OutcomeAction;
};

export type DispositionDefinition = {
  code: string;
  label: string;
  category: "success" | "retryable" | "terminal" | "review";
  terminal: boolean;
  retryable: boolean;
  requiredFields: string[];
  deprecatedAt?: string;
};

export type CallbackCommitment = {
  customerId: string;
  channelId: string;
  reason: string;
  timezone: string;
  earliestAt: string;
  latestAt: string;
  ownerId?: string;
  status: CallbackStatus;
};

const RAW_CLASSIFICATION_MAP: Record<string, AnswerClassification> = {
  human: "human",
  answered_by_human: "human",
  machine_start: "machine_start",
  machine_end: "machine_end_beep",
  beep: "machine_end_beep",
  fax: "fax",
  silence: "silence",
  no_answer: "no_answer",
  busy: "busy",
  invalid: "invalid_unreachable",
  failed: "provider_error",
};

export function normalizeAnswerClassification(raw: string, evidence: ClassificationEvidence) {
  return {
    classification: RAW_CLASSIFICATION_MAP[raw.toLowerCase()] ?? "unknown" as AnswerClassification,
    evidence,
  };
}

export function chooseOutcomeAction(policy: AmdPolicy, classification: AnswerClassification): OutcomeAction {
  if (policy.mode === "disabled") return "start_agent";
  if (classification === "human") return policy.humanAction;
  if (classification === "machine_start") return policy.machineStartAction;
  if (classification === "machine_end_beep") return policy.beepAction;
  if (["no_answer", "busy"].includes(classification)) return "schedule_retry";
  if (["invalid_unreachable", "fax"].includes(classification)) return "mark_terminal";
  return policy.unknownAction;
}

export function buildVoicemailSideEffectKey(args: { campaignRunId: string; recipientRunId: string; attemptNumber: number; voicemailVersionId: string }) {
  return `vm_${createHash("sha256").update(`${args.campaignRunId}:${args.recipientRunId}:${args.attemptNumber}:${args.voicemailVersionId}`).digest("hex").slice(0, 16)}`;
}

export function validateDispositionAssignment(definition: DispositionDefinition, fields: Record<string, unknown>) {
  const issues: string[] = [];
  if (definition.deprecatedAt) issues.push(`${definition.code} disposition is deprecated`);
  for (const field of definition.requiredFields) if (!(field in fields)) issues.push(`${definition.code} requires ${field}`);
  if (definition.terminal && definition.retryable) issues.push(`${definition.code} cannot be terminal and retryable`);
  return issues;
}

export function buildCallbackDeduplicationKey(callback: CallbackCommitment) {
  return `${callback.customerId}:${callback.channelId}:${callback.reason}:${callback.status === "cancelled" ? "cancelled" : "active"}`;
}

export function transitionCallbackStatus(current: CallbackStatus, next: CallbackStatus): CallbackStatus {
  if (current === next) return current;
  const allowed: Record<CallbackStatus, CallbackStatus[]> = {
    requested: ["assigned", "scheduled", "cancelled", "expired"],
    assigned: ["scheduled", "completed", "cancelled", "missed", "expired"],
    scheduled: ["completed", "cancelled", "missed", "expired"],
    missed: ["scheduled", "cancelled", "expired"],
    completed: [],
    cancelled: [],
    expired: [],
  };
  if (!allowed[current].includes(next)) throw new Error(`callback cannot transition from ${current} to ${next}`);
  return next;
}

export function shouldStopJourney(reason: "opt_out" | "dnc" | "campaign_cancelled" | "goal_reached" | "expired" | "step_completed") {
  return ["opt_out", "dnc", "campaign_cancelled", "goal_reached", "expired"].includes(reason);
}
