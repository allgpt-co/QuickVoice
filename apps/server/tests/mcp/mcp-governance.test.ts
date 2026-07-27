import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMcpSchemaSnapshot,
  evaluateMcpInvocation,
  hashInvocation,
  shouldRetryMcpInvocation,
  type McpCapabilityPolicy,
  type McpInvocationRequest,
} from "../../src/modules/mcp/mcp-governance.js";

const policy: McpCapabilityPolicy = {
  organizationId: "org_1",
  environmentId: "prod",
  agentId: "agent_1",
  allowedScopes: ["calls:read", "messages:send"],
  riskApprovals: { read: "auto", write: "human_required", communication: "human_required", financial: "deny", customer_record: "human_required", destructive: "deny", unknown: "deny" },
  maxPayloadBytes: 1024,
  timeoutMs: 5000,
  allowRetriesForIdempotent: true,
};

const request: McpInvocationRequest = {
  organizationId: "org_1",
  environmentId: "prod",
  agentId: "agent_1",
  serverId: "srv_1",
  toolName: "send_message",
  risk: "communication",
  scopes: ["messages:send"],
  arguments: { text: "hello", customerEmail: "caller@example.com" },
  requestedBy: "human",
};

test("MCP schema snapshots hash discovered capabilities and flag drift for review", () => {
  const first = buildMcpSchemaSnapshot({ serverId: "srv_1", protocolVersion: "2025-06-18", fetchedAt: "2026-07-26T00:00:00.000Z", schema: { tools: ["read"] } });
  const second = buildMcpSchemaSnapshot({ serverId: "srv_1", protocolVersion: "2025-06-18", fetchedAt: "2026-07-26T00:01:00.000Z", schema: { tools: ["read", "write"] }, previousHash: first.contentHash });

  assert.equal(first.trustStatus, "unreviewed");
  assert.equal(second.trustStatus, "schema_changed");
});

test("MCP invocation policy enforces scopes, payload size, risk mode, and request-bound human approval", () => {
  const requestHash = hashInvocation(request);
  assert.deepEqual(evaluateMcpInvocation(policy, { ...request, approval: { approvalId: "appr_1", actorId: "user_1", requestHash, expiresAt: "2026-07-27T00:00:00.000Z" } }, new Date("2026-07-26T00:00:00.000Z")), {
    allowed: true,
    reasons: [],
    sanitizedArguments: { text: "hello", customerEmail: "[redacted]" },
  });

  assert.deepEqual(evaluateMcpInvocation(policy, { ...request, requestedBy: "model", approval: { approvalId: "appr_1", actorId: "model", requestHash, expiresAt: "2026-07-27T00:00:00.000Z" } }, new Date("2026-07-26T00:00:00.000Z")).reasons, ["model cannot self-approve"]);
  assert.deepEqual(evaluateMcpInvocation(policy, { ...request, scopes: ["admin:*"], risk: "destructive" }).reasons, ["scope not granted: admin:*", "risk denied: destructive"]);
});

test("MCP retry policy only retries approved idempotent non-destructive invocations", () => {
  assert.deepEqual(shouldRetryMcpInvocation({ policy, risk: "read", idempotent: true, idempotencyKey: "idem", status: 500 }), { retry: true, reason: "retryable" });
  assert.deepEqual(shouldRetryMcpInvocation({ policy, risk: "destructive", idempotent: true, idempotencyKey: "idem", status: 500 }), { retry: false, reason: "risk_not_retryable" });
  assert.deepEqual(shouldRetryMcpInvocation({ policy, risk: "write", idempotent: false, status: 500 }), { retry: false, reason: "not_idempotent" });
});
