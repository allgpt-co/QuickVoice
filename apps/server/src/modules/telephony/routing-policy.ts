export type CallDirection = "inbound" | "outbound";
export type TrunkHealth = "healthy" | "degraded" | "disabled" | "draining";

export type SipTrunkConfig = {
  trunkId: string;
  provider: "twilio" | "telnyx" | "generic_sip" | "livekit";
  direction: "ingress" | "egress" | "both";
  health: TrunkHealth;
  capacityAvailable: boolean;
  region?: string;
  username?: string;
  passwordSecretRef?: string;
  certificateSecretRef?: string;
};

export type RoutingRule = {
  ruleId: string;
  priority: number;
  direction?: CallDirection;
  calledNumber?: string;
  callingNumber?: string;
  agentId?: string;
  campaignId?: string;
  preferredRegion?: string;
  trunkId: string;
};

export type RouteDryRunInput = {
  direction: CallDirection;
  calledNumber?: string;
  callingNumber?: string;
  agentId?: string;
  campaignId?: string;
  region?: string;
};

export type RouteDryRunResult = {
  selected?: {
    ruleId: string;
    trunkId: string;
    region?: string;
  };
  rejected: { ruleId: string; reason: string }[];
};

export function normalizeDialNumber(value: string) {
  const trimmed = value.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new Error("phone number must contain 7 to 15 digits");
  return `${plus}${digits}`;
}

export function redactSipTrunk(trunk: SipTrunkConfig) {
  return {
    ...trunk,
    username: trunk.username ? "[configured]" : undefined,
    passwordSecretRef: trunk.passwordSecretRef ? "[secret-ref]" : undefined,
    certificateSecretRef: trunk.certificateSecretRef ? "[secret-ref]" : undefined,
  };
}

export function dryRunRoutingPolicy({
  policyVersion,
  rules,
  trunks,
  input,
}: {
  policyVersion: string;
  rules: RoutingRule[];
  trunks: SipTrunkConfig[];
  input: RouteDryRunInput;
}): RouteDryRunResult & { policyVersion: string } {
  const rejected: RouteDryRunResult["rejected"] = [];
  const trunksById = new Map(trunks.map((trunk) => [trunk.trunkId, trunk]));

  for (const rule of [...rules].sort((left, right) => left.priority - right.priority || left.ruleId.localeCompare(right.ruleId))) {
    const mismatch = ruleMismatch(rule, input);
    if (mismatch) {
      rejected.push({ ruleId: rule.ruleId, reason: mismatch });
      continue;
    }

    const trunk = trunksById.get(rule.trunkId);
    if (!trunk) {
      rejected.push({ ruleId: rule.ruleId, reason: "trunk_not_found" });
      continue;
    }
    if (!trunkSupportsDirection(trunk, input.direction)) {
      rejected.push({ ruleId: rule.ruleId, reason: "trunk_direction_mismatch" });
      continue;
    }
    if (trunk.health !== "healthy") {
      rejected.push({ ruleId: rule.ruleId, reason: `trunk_${trunk.health}` });
      continue;
    }
    if (!trunk.capacityAvailable) {
      rejected.push({ ruleId: rule.ruleId, reason: "trunk_capacity_exhausted" });
      continue;
    }

    return {
      policyVersion,
      selected: { ruleId: rule.ruleId, trunkId: trunk.trunkId, region: rule.preferredRegion ?? trunk.region },
      rejected,
    };
  }

  return { policyVersion, rejected };
}

function ruleMismatch(rule: RoutingRule, input: RouteDryRunInput) {
  if (rule.direction && rule.direction !== input.direction) return "direction_mismatch";
  if (rule.calledNumber && normalizeDialNumber(rule.calledNumber) !== (input.calledNumber ? normalizeDialNumber(input.calledNumber) : "")) {
    return "called_number_mismatch";
  }
  if (rule.callingNumber && normalizeDialNumber(rule.callingNumber) !== (input.callingNumber ? normalizeDialNumber(input.callingNumber) : "")) {
    return "calling_number_mismatch";
  }
  if (rule.agentId && rule.agentId !== input.agentId) return "agent_mismatch";
  if (rule.campaignId && rule.campaignId !== input.campaignId) return "campaign_mismatch";
  if (rule.preferredRegion && input.region && rule.preferredRegion !== input.region) return "region_mismatch";
  return "";
}

function trunkSupportsDirection(trunk: SipTrunkConfig, direction: CallDirection) {
  if (trunk.direction === "both") return true;
  return direction === "inbound" ? trunk.direction === "ingress" : trunk.direction === "egress";
}
