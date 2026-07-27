import assert from "node:assert/strict";
import { test } from "node:test";

import { deleteAgent } from "../../src/modules/agent/agent.service.js";

test("agent deletion unlinks numbers and cleans KB assets before deleting the row", async () => {
  const operations: string[] = [];

  await deleteAgent("org_123", "agent_123", {
    getAgentDeletionContextImpl: async () => ({
      agentId: "agent_123",
      phoneNumbers: [{ phId: "phone_1" }, { phId: "phone_2" }],
      knowledgeSources: [
        {
          kbId: "kb_1",
          agentId: "agent_123",
          storagePath: "kb/org_123/file.pdf",
          sourceType: "PDF",
        },
      ],
    }),
    unlinkNumberImpl: async ({ phId, agentId }) => {
      operations.push(`unlink:${phId}:${String(agentId)}`);
      return {} as never;
    },
    cleanupKnowledgeSourceAssetsImpl: async ({ kbId }) => {
      operations.push(`cleanup:${kbId}`);
    },
    deleteKnowledgeSourceImpl: async (kbId) => {
      operations.push(`delete-kb:${kbId}`);
      return {} as never;
    },
    deleteAgentImpl: async () => {
      operations.push("delete-agent");
      return { count: 1 };
    },
  });

  assert.deepEqual(operations, [
    "unlink:phone_1:null",
    "unlink:phone_2:null",
    "cleanup:kb_1",
    "delete-kb:kb_1",
    "delete-agent",
  ]);
});

test("agent deletion stops before the database delete when external cleanup fails", async () => {
  let deleted = false;

  await assert.rejects(
    deleteAgent("org_123", "agent_123", {
      getAgentDeletionContextImpl: async () => ({
        agentId: "agent_123",
        phoneNumbers: [],
        knowledgeSources: [
          {
            kbId: "kb_1",
            agentId: "agent_123",
            storagePath: "kb/org_123/file.pdf",
            sourceType: "PDF",
          },
        ],
      }),
      cleanupKnowledgeSourceAssetsImpl: async () => {
        throw new Error("object storage unavailable");
      },
      deleteAgentImpl: async () => {
        deleted = true;
        return { count: 1 };
      },
    }),
    /object storage unavailable/
  );

  assert.equal(deleted, false);
});
