import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WORKFLOW_SCHEMA_VERSION,
  buildLegacyAgentWorkflowDocument,
} from "../../src/modules/agent/agent-workflow-adapter.js";

test("buildLegacyAgentWorkflowDocument adapts a single-prompt agent into a versioned workflow", () => {
  const workflow = buildLegacyAgentWorkflowDocument({
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    firstMessage: "Hi, how can I help?",
    systemPrompt: "You are a helpful assistant.",
  });

  assert.equal(workflow.schemaVersion, WORKFLOW_SCHEMA_VERSION);
  assert.equal(workflow.workflowId, "legacy-agent-8d55565f-1111-4111-8111-f95fd03f0df2");
  assert.equal(workflow.entryNodeId, "start");
  assert.deepEqual(
    workflow.nodes.map((node) => node.type),
    ["conversation.start", "conversation.agent", "conversation.end"]
  );
  assert.deepEqual(workflow.edges, [
    { id: "start-to-agent", from: "start", to: "agent" },
    { id: "agent-to-end", from: "agent", to: "end" },
  ]);
  assert.match(workflow.metadata.digest, /^[a-f0-9]{64}$/);
});

test("buildLegacyAgentWorkflowDocument produces a stable digest for identical content", () => {
  const input = {
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    firstMessage: "Hi, how can I help?",
    systemPrompt: "You are a helpful assistant.",
  };

  assert.equal(
    buildLegacyAgentWorkflowDocument(input).metadata.digest,
    buildLegacyAgentWorkflowDocument(input).metadata.digest
  );
});
