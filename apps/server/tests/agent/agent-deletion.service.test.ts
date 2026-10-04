import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteAgent,
  requestAgentDeletion,
} from "../../src/modules/agent/agent.service.js";

test("agent deletion is durably requested even when the initial enqueue fails", async () => {
  const requestedAt = new Date("2026-10-01T12:00:00.000Z");
  const result = await requestAgentDeletion("org_123", "agent_123", {
    requestAgentDeletionImpl: async () => ({
      agentId: "agent_123",
      deletionRequestedAt: requestedAt,
    }),
    enqueueAgentDeletionImpl: async () => {
      throw new Error("redis unavailable");
    },
  });

  assert.deepEqual(result, {
    agentId: "agent_123",
    status: "deleting",
    requestedAt,
  });
});

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
    claimKnowledgeSourceDeletionImpl: async () =>
      ({
        kbId: "kb_1",
        agentId: "agent_123",
        storagePath: "kb/org_123/file.pdf",
        sourceType: "PDF",
      }) as never,
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
      claimKnowledgeSourceDeletionImpl: async () =>
        ({
          kbId: "kb_1",
          agentId: "agent_123",
          storagePath: "kb/org_123/file.pdf",
          sourceType: "PDF",
        }) as never,
      deleteAgentImpl: async () => {
        deleted = true;
        return { count: 1 };
      },
    }),
    /object storage unavailable/,
  );

  assert.equal(deleted, false);
});

test("agent deletion resumes from resources that remain after a partial failure", async () => {
  const linkedNumbers = new Set(["phone_1", "phone_2"]);
  const attempts: string[] = [];
  let failSecondNumber = true;
  let deleted = 0;
  const dependencies = {
    getAgentDeletionContextImpl: async () => ({
      agentId: "agent_123",
      phoneNumbers: [...linkedNumbers].map((phId) => ({ phId })),
      knowledgeSources: [],
    }),
    unlinkNumberImpl: async ({ phId }: { phId: string }) => {
      attempts.push(phId);
      if (phId === "phone_2" && failSecondNumber) {
        failSecondNumber = false;
        throw new Error("livekit unavailable");
      }
      linkedNumbers.delete(phId);
      return {} as never;
    },
    deleteAgentImpl: async () => {
      deleted += 1;
      return { count: 1 };
    },
  };

  await assert.rejects(
    deleteAgent("org_123", "agent_123", dependencies),
    /livekit unavailable/,
  );
  await deleteAgent("org_123", "agent_123", dependencies);

  assert.deepEqual(attempts, ["phone_1", "phone_2", "phone_2"]);
  assert.equal(linkedNumbers.size, 0);
  assert.equal(deleted, 1);
});
