import { test } from "node:test";
import assert from "node:assert/strict";

import {
  advanceSimulationStatus,
  buildSanitizedReplayCase,
  buildSimulationRunPlan,
  compareExecutionSummaries,
} from "../../src/modules/simulation/simulation-contract.js";

test("simulation plans are deterministic for seed, fixtures, breakpoints, and safe variables", () => {
  const request = {
    organizationId: "org_1",
    workflowVersionId: "wv_1",
    actorId: "user_1",
    mode: "simulation" as const,
    scenarioName: "billing edge case",
    seed: "seed-123",
    initialVariables: { account_status: "past_due", phone_number: "+15550101000" },
    breakpoints: ["collect-payment", "start", "start"],
    fixtures: [{ fixtureId: "fx_1", nodeId: "http_lookup", kind: "http" as const, outcome: "success" as const, response: { ok: true } }],
  };
  const plan = buildSimulationRunPlan(request);
  const secondPlan = buildSimulationRunPlan(request);

  assert.match(plan.runId, /^sim_[a-f0-9]{16}$/);
  assert.equal(secondPlan.runId, plan.runId);
  assert.deepEqual(plan.breakpoints, ["collect-payment", "start"]);
  assert.deepEqual(plan.initialVariables, { account_status: "past_due" });
  assert.equal(plan.fixtureMap.http_lookup.fixtureId, "fx_1");
});

test("simulation denies real side-effect fixtures unless explicitly enabled", () => {
  assert.throws(
    () => buildSimulationRunPlan({
      organizationId: "org_1",
      workflowVersionId: "wv_1",
      actorId: "user_1",
      mode: "simulation",
      scenarioName: "real endpoint",
      seed: "s",
      fixtures: [{ fixtureId: "fx_2", nodeId: "send_sms", kind: "provider", outcome: "success", executesRealSideEffect: true }],
    }),
    /side effects denied/,
  );
});

test("simulation status transitions support breakpoint pause, continue, stop, and final states", () => {
  assert.equal(advanceSimulationStatus("queued", "start"), "running");
  assert.equal(advanceSimulationStatus("running", "pause"), "paused");
  assert.equal(advanceSimulationStatus("paused", "continue"), "running");
  assert.equal(advanceSimulationStatus("running", "complete"), "completed");
  assert.equal(advanceSimulationStatus("completed", "fail"), "completed");
  assert.throws(() => advanceSimulationStatus("queued", "complete"), /invalid/);
});

test("production-derived replay cases are sanitized and pinned to source/candidate workflow versions", () => {
  const replay = buildSanitizedReplayCase({
    organizationId: "org_1",
    sourceCallId: "call_1",
    sourceWorkflowVersionId: "wv_prod_1",
    candidateWorkflowVersionId: "wv_draft_2",
    transcriptExcerpt: "My email is caller@example.com and phone is +1 555 010 1000.",
    variables: { intent: "billing", email: "caller@example.com", api_token: "abc" },
  });

  assert.equal(replay.sanitized, true);
  assert.equal(replay.sourceWorkflowVersionId, "wv_prod_1");
  assert.equal(replay.candidateWorkflowVersionId, "wv_draft_2");
  assert.doesNotMatch(replay.transcriptExcerpt, /caller@example|555/);
  assert.deepEqual(replay.variables, { intent: "billing" });
});

test("execution comparison reports path, outcome, assertion, cost, and latency deltas", () => {
  const diff = compareExecutionSummaries(
    { nodePath: ["start", "agent", "end"], outcome: "completed", estimatedCostCents: 12, latencyMs: 1000, assertionResults: { greeting: true } },
    { nodePath: ["start", "agent", "handoff", "end"], outcome: "handoff", estimatedCostCents: 15, latencyMs: 1400, assertionResults: { greeting: false } },
  );

  assert.deepEqual(diff, {
    pathChanged: true,
    addedNodes: ["handoff"],
    removedNodes: [],
    outcomeChanged: true,
    estimatedCostDeltaCents: 3,
    latencyDeltaMs: 400,
    assertionChanges: { greeting: false },
  });
});
