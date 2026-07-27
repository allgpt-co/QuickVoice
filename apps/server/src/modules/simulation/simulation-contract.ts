import { createHash } from "node:crypto";

export type ExecutionMode = "simulation" | "replay" | "production";
export type SimulationStatus = "queued" | "running" | "paused" | "stopped" | "completed" | "failed" | "expired";
export type SimulationAction = "start" | "pause" | "continue" | "stop" | "complete" | "fail" | "expire";
export type MockableNodeKind = "built_in" | "http" | "mcp" | "handoff" | "wait" | "provider";

export type SimulationFixture = {
  fixtureId: string;
  nodeId: string;
  kind: MockableNodeKind;
  outcome: "success" | "failure" | "timeout";
  response?: unknown;
  executesRealSideEffect?: boolean;
};

export type SimulationRunRequest = {
  organizationId: string;
  workflowVersionId: string;
  actorId: string;
  mode: "simulation" | "replay";
  scenarioName: string;
  seed: string;
  initialVariables?: Record<string, string | number | boolean | null>;
  locale?: string;
  channel?: "web" | "phone" | "preview";
  sourceCallId?: string;
  breakpoints?: string[];
  fixtures?: SimulationFixture[];
  allowRealSideEffects?: boolean;
};

export type SimulationRunPlan = SimulationRunRequest & {
  runId: string;
  status: SimulationStatus;
  fixtureMap: Record<string, SimulationFixture>;
  sideEffectsAllowed: boolean;
  structuralHash: string;
};

export type ReplayCase = {
  replayId: string;
  organizationId: string;
  sourceCallId: string;
  sourceWorkflowVersionId: string;
  candidateWorkflowVersionId: string;
  transcriptExcerpt: string;
  variables: Record<string, string>;
  sanitized: true;
};

export type ExecutionSummary = {
  nodePath: string[];
  outcome: string;
  estimatedCostCents: number;
  latencyMs: number;
  assertionResults?: Record<string, boolean>;
};

const SECRET_OR_PII_KEY = /phone|email|address|name|secret|token|password|authorization|recording|transcript/i;
const VALUE_REDACTIONS: [RegExp, string][] = [
  [/\+?\d[\d .()\-]{7,}\d/g, "[redacted phone]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]"],
  [/(api[-_]?key|secret|token|password)\s*[:=]\s*[^\s,}]+/gi, "$1=[redacted]"],
];

export function buildSimulationRunPlan(request: SimulationRunRequest): SimulationRunPlan {
  if (request.mode === "replay" && !request.sourceCallId) throw new Error("replay runs require a sourceCallId");
  if (!request.scenarioName.trim()) throw new Error("scenarioName is required");
  if (!request.seed.trim()) throw new Error("seed is required for deterministic simulation");

  const fixtures = request.fixtures ?? [];
  const realSideEffects = fixtures.filter((fixture) => fixture.executesRealSideEffect);
  if (realSideEffects.length > 0 && !request.allowRealSideEffects) {
    throw new Error(`simulation side effects denied by default: ${realSideEffects.map((fixture) => fixture.nodeId).join(", ")}`);
  }

  const fixtureMap = Object.fromEntries(fixtures.map((fixture) => [fixture.nodeId, fixture]));
  const safeInitialVariables = Object.fromEntries(
    Object.entries(request.initialVariables ?? {}).filter(([key]) => !SECRET_OR_PII_KEY.test(key)),
  );
  const structuralPayload = {
    workflowVersionId: request.workflowVersionId,
    scenarioName: request.scenarioName,
    seed: request.seed,
    initialVariables: safeInitialVariables,
    fixtureIds: fixtures.map((fixture) => fixture.fixtureId).sort(),
    breakpoints: [...new Set(request.breakpoints ?? [])].sort(),
  };

  return {
    ...request,
    initialVariables: safeInitialVariables,
    fixtures,
    breakpoints: structuralPayload.breakpoints,
    runId: `sim_${hashJson({ organizationId: request.organizationId, ...structuralPayload }).slice(0, 16)}`,
    status: "queued",
    fixtureMap,
    sideEffectsAllowed: Boolean(request.allowRealSideEffects),
    structuralHash: hashJson(structuralPayload),
  };
}

export function advanceSimulationStatus(current: SimulationStatus, action: SimulationAction): SimulationStatus {
  if (["completed", "failed", "expired"].includes(current)) return current;
  const transitions: Record<SimulationStatus, Partial<Record<SimulationAction, SimulationStatus>>> = {
    queued: { start: "running", stop: "stopped", expire: "expired" },
    running: { pause: "paused", stop: "stopped", complete: "completed", fail: "failed", expire: "expired" },
    paused: { continue: "running", stop: "stopped", expire: "expired" },
    stopped: { expire: "expired" },
    completed: {},
    failed: {},
    expired: {},
  };
  const next = transitions[current][action];
  if (!next) throw new Error(`simulation action ${action} is invalid from ${current}`);
  return next;
}

export function buildSanitizedReplayCase(args: Omit<ReplayCase, "replayId" | "transcriptExcerpt" | "variables" | "sanitized"> & {
  transcriptExcerpt: string;
  variables: Record<string, string>;
}): ReplayCase {
  return {
    replayId: `replay_${hashJson({ organizationId: args.organizationId, sourceCallId: args.sourceCallId, candidateWorkflowVersionId: args.candidateWorkflowVersionId }).slice(0, 16)}`,
    organizationId: args.organizationId,
    sourceCallId: args.sourceCallId,
    sourceWorkflowVersionId: args.sourceWorkflowVersionId,
    candidateWorkflowVersionId: args.candidateWorkflowVersionId,
    transcriptExcerpt: redactText(args.transcriptExcerpt),
    variables: Object.fromEntries(
      Object.entries(args.variables)
        .filter(([key]) => !SECRET_OR_PII_KEY.test(key))
        .map(([key, value]) => [key, redactText(value)]),
    ),
    sanitized: true,
  };
}

export function compareExecutionSummaries(source: ExecutionSummary, replay: ExecutionSummary) {
  return {
    pathChanged: source.nodePath.join(" > ") !== replay.nodePath.join(" > "),
    addedNodes: replay.nodePath.filter((nodeId) => !source.nodePath.includes(nodeId)),
    removedNodes: source.nodePath.filter((nodeId) => !replay.nodePath.includes(nodeId)),
    outcomeChanged: source.outcome !== replay.outcome,
    estimatedCostDeltaCents: replay.estimatedCostCents - source.estimatedCostCents,
    latencyDeltaMs: replay.latencyMs - source.latencyMs,
    assertionChanges: Object.fromEntries(
      Object.entries(replay.assertionResults ?? {}).filter(([assertionId, result]) => source.assertionResults?.[assertionId] !== result),
    ),
  };
}

function redactText(value: string) {
  return VALUE_REDACTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
