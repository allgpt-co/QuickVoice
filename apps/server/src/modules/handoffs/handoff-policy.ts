export type HandoffState =
  | "requested"
  | "briefing"
  | "ringing"
  | "accepted"
  | "bridged"
  | "rejected"
  | "failed"
  | "canceled"
  | "completed";

export type HandoffEvent =
  | "brief_ready"
  | "target_ringing"
  | "target_accepted"
  | "bridge_started"
  | "target_rejected"
  | "provider_failed"
  | "caller_canceled"
  | "bridge_completed";

export type HandoffFallbackAction =
  | "next_target"
  | "return_to_agent"
  | "offer_callback"
  | "leave_voicemail"
  | "send_follow_up"
  | "terminate";

export type HandoffPolicy = {
  policyId: string;
  organizationId: string;
  version: number;
  mode: "cold" | "warm";
  maxWaitSeconds: number;
  fallbacks: Record<"reject" | "timeout" | "no_answer" | "failure", HandoffFallbackAction[]>;
  summaryAllowedFields: string[];
};

export type QueueMember = {
  memberId: string;
  organizationId: string;
  available: boolean;
  skills: string[];
  languages: string[];
  priority: number;
  activeCalls: number;
  maxConcurrentCalls: number;
};

export type QueueRoutingRequest = {
  organizationId: string;
  requiredSkills?: string[];
  language?: string;
  strategy: "priority" | "least_busy" | "round_robin";
  cursor?: number;
};

export type HandoffSummaryInput = {
  verifiedFacts: Record<string, string>;
  generatedSummary?: string;
  unresolvedItems?: string[];
  sentiment?: "positive" | "neutral" | "negative" | "unknown";
  riskFlags?: string[];
  zeroPii?: boolean;
};

const TERMINAL_STATES = new Set<HandoffState>(["rejected", "failed", "canceled", "completed"]);

const STATE_TRANSITIONS: Record<HandoffState, Partial<Record<HandoffEvent, HandoffState>>> = {
  requested: {
    brief_ready: "briefing",
    target_ringing: "ringing",
    target_rejected: "rejected",
    provider_failed: "failed",
    caller_canceled: "canceled",
  },
  briefing: {
    target_ringing: "ringing",
    target_rejected: "rejected",
    provider_failed: "failed",
    caller_canceled: "canceled",
  },
  ringing: {
    target_accepted: "accepted",
    target_rejected: "rejected",
    provider_failed: "failed",
    caller_canceled: "canceled",
  },
  accepted: {
    bridge_started: "bridged",
    provider_failed: "failed",
    caller_canceled: "canceled",
  },
  bridged: {
    bridge_completed: "completed",
    provider_failed: "failed",
    caller_canceled: "canceled",
  },
  rejected: {},
  failed: {},
  canceled: {},
  completed: {},
};

const TERMINAL_FALLBACKS = new Set<HandoffFallbackAction>([
  "return_to_agent",
  "offer_callback",
  "leave_voicemail",
  "send_follow_up",
  "terminate",
]);

const SENSITIVE_FIELD_PATTERN = /phone|email|address|transcript|recording|secret|token|password|authorization/i;
const PII_VALUE_PATTERNS: [RegExp, string][] = [
  [/\+?\d[\d .()\-]{7,}\d/g, "[redacted phone]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]"],
];

export function transitionHandoffState(current: HandoffState, event: HandoffEvent): HandoffState {
  const next = STATE_TRANSITIONS[current][event];
  if (next) return next;
  if (TERMINAL_STATES.has(current)) return current;
  throw new Error(`handoff event ${event} is invalid from ${current}`);
}

export function validateHandoffPolicy(policy: HandoffPolicy): string[] {
  const issues: string[] = [];

  if (policy.version < 1) issues.push("policy version must be positive");
  if (policy.maxWaitSeconds < 1 || policy.maxWaitSeconds > 3600) issues.push("maxWaitSeconds must be between 1 and 3600");

  for (const [reason, actions] of Object.entries(policy.fallbacks)) {
    if (actions.length === 0) {
      issues.push(`${reason} fallback must include at least one action`);
      continue;
    }

    const terminalIndex = actions.findIndex((action) => TERMINAL_FALLBACKS.has(action));
    if (terminalIndex === -1) issues.push(`${reason} fallback has no terminal action`);
    if (actions.at(-1) === "next_target") {
      issues.push(`${reason} fallback can loop forever after next_target`);
    }
  }

  const forbiddenFields = policy.summaryAllowedFields.filter((field) => SENSITIVE_FIELD_PATTERN.test(field));
  if (forbiddenFields.length > 0) issues.push(`summary exposes sensitive fields: ${forbiddenFields.join(", ")}`);

  return issues;
}

export function selectQueueMembers(request: QueueRoutingRequest, members: QueueMember[]): QueueMember[] {
  const requiredSkills = new Set(request.requiredSkills ?? []);
  const eligible = members.filter((member) => {
    if (member.organizationId !== request.organizationId) return false;
    if (!member.available) return false;
    if (member.activeCalls >= member.maxConcurrentCalls) return false;
    if (request.language && !member.languages.includes(request.language)) return false;
    return [...requiredSkills].every((skill) => member.skills.includes(skill));
  });

  const ranked = [...eligible].sort((left, right) => {
    if (request.strategy === "least_busy") return left.activeCalls - right.activeCalls || right.priority - left.priority;
    return right.priority - left.priority || left.activeCalls - right.activeCalls;
  });

  if (request.strategy !== "round_robin" || ranked.length === 0) return ranked;
  const offset = Math.abs(request.cursor ?? 0) % ranked.length;
  return [...ranked.slice(offset), ...ranked.slice(0, offset)];
}

export function buildHandoffSummary(policy: HandoffPolicy, input: HandoffSummaryInput) {
  const allowed = new Set(policy.summaryAllowedFields);
  const verifiedFacts = Object.fromEntries(
    Object.entries(input.verifiedFacts)
      .filter(([field]) => allowed.has(field) && !SENSITIVE_FIELD_PATTERN.test(field))
      .map(([field, value]) => [field, input.zeroPii ? redactPii(value) : value]),
  );

  return {
    policyId: policy.policyId,
    policyVersion: policy.version,
    verifiedFacts,
    generated: input.generatedSummary
      ? {
          text: input.zeroPii ? redactPii(input.generatedSummary) : input.generatedSummary,
          source: "ai_generated" as const,
        }
      : { text: "", source: "unavailable" as const },
    unresolvedItems: input.unresolvedItems ?? [],
    sentiment: input.sentiment ?? "unknown",
    riskFlags: input.riskFlags ?? [],
  };
}

function redactPii(value: string) {
  return PII_VALUE_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}
