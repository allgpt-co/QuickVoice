import assert from "node:assert/strict";
import { test } from "node:test";

import { recoverPendingAgentDeletions } from "../../src/modules/agent/agent-deletion-recovery.service.js";

test("agent deletion recovery re-enqueues every durable pending operation", async () => {
  const enqueued: Array<{ agentId: string; organizationId: string }> = [];
  const result = await recoverPendingAgentDeletions({
    listPendingImpl: async () => [
      { agentId: "agent_1", organizationId: "org_1" },
      { agentId: "agent_2", organizationId: "org_2" },
    ],
    enqueueImpl: async (data) => {
      enqueued.push(data);
    },
  });

  assert.deepEqual(enqueued, [
    { agentId: "agent_1", organizationId: "org_1" },
    { agentId: "agent_2", organizationId: "org_2" },
  ]);
  assert.deepEqual(result, { pending: 2, failed: 0 });
});
