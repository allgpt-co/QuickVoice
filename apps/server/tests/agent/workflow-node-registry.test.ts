import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FIRST_PARTY_NODE_MANIFESTS,
  findWorkflowNodeManifest,
  validateWorkflowGraphInvariants,
  validateWorkflowNodeInstance,
} from "../../src/modules/agent/workflow-node-registry.js";

test("first-party workflow registry includes required orchestration node families", () => {
  const types = FIRST_PARTY_NODE_MANIFESTS.map((node) => node.type);
  for (const type of ["conversation.subagent", "decision.switch", "decision.llm_classify", "tool.http", "tool.mcp", "handoff.human", "data.set", "time.wait", "time.business_hours", "terminal.success", "terminal.opted_out", "terminal.voicemail"]) {
    assert.ok(types.includes(type), `${type} should be registered`);
  }
  assert.equal(findWorkflowNodeManifest("tool.mcp")?.retry.idempotencyRequired, true);
});

test("workflow node validation catches config type, missing required ports, and permissions", () => {
  assert.deepEqual(validateWorkflowNodeInstance({ type: "tool.mcp", version: 1, config: { connectionId: "conn", toolName: "lookup", arguments: {} }, outgoingPorts: ["success", "failure", "timeout"], grantedPermissions: ["tools:read"] }), []);
  assert.deepEqual(validateWorkflowNodeInstance({ type: "tool.mcp", version: 1, config: { connectionId: "conn", toolName: 123, arguments: [] }, outgoingPorts: ["success"], grantedPermissions: [] }), [
    "tool.mcp.toolName must be string",
    "tool.mcp.arguments must be object",
    "tool.mcp requires failure edge",
    "tool.mcp requires timeout edge",
    "tool.mcp requires tools:read",
  ]);
});

test("workflow graph invariants detect missing nodes and incompatible ports", () => {
  assert.deepEqual(validateWorkflowGraphInvariants([{ id: "start", type: "decision.switch", version: 1 }, { id: "end", type: "terminal.success", version: 1 }], [{ from: "start", fromPort: "success", to: "end" }]), []);
  assert.deepEqual(validateWorkflowGraphInvariants([{ id: "start", type: "decision.switch", version: 1 }], [{ from: "missing", fromPort: "success", to: "end" }, { from: "start", fromPort: "weird", to: "start" }]), [
    "edge starts from missing node missing",
    "edge points to missing node end",
    "start uses unknown port weird",
  ]);
});
