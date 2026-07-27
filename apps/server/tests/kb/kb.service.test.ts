import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanupKnowledgeSourceAssets } from "../../src/modules/kb/kb-assets.service.js";

test("knowledge source cleanup calls the authenticated AI vector endpoint", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];

  await cleanupKnowledgeSourceAssets(
    {
      kbId: "kb/with spaces",
      agentId: "agent/123",
      storagePath: "https://docs.example.test",
      sourceType: "URL",
    },
    {
      aiApiUrl: "https://ai.example.test/",
      internalApiKey: "internal-test-key",
      fetchImpl: async (input, init) => {
        requests.push({ input: String(input), init });
        return new Response(null, { status: 204 });
      },
    }
  );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.input,
    "https://ai.example.test/kb/agent%2F123/kb%2Fwith%20spaces"
  );
  assert.equal(requests[0]?.init?.method, "DELETE");
  assert.deepEqual(requests[0]?.init?.headers, {
    "x-internal-key": "internal-test-key",
  });
});

test("knowledge source cleanup rejects when vector cleanup fails", async () => {
  await assert.rejects(
    cleanupKnowledgeSourceAssets(
      {
        kbId: "kb_123",
        agentId: "agent_123",
        storagePath: "https://docs.example.test",
        sourceType: "URL",
      },
      {
        aiApiUrl: "https://ai.example.test",
        internalApiKey: "internal-test-key",
        fetchImpl: async () =>
          new Response("Pinecone unavailable", { status: 503 }),
      }
    ),
    /KB vector cleanup returned 503/
  );
});
