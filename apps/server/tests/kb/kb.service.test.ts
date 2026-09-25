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
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.input,
    "https://ai.example.test/kb/agent%2F123/kb%2Fwith%20spaces",
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
      },
    ),
    { statusCode: 502, code: "KB_VECTOR_CLEANUP_FAILED" },
  );
});

const fileSource = {
  kbId: "kb_test",
  agentId: "agent_test",
  storagePath: "kb/org_test/source.pdf",
  sourceType: "PDF",
};

test("cleanup validates internal authentication before touching source storage", async () => {
  const actions: string[] = [];
  await assert.rejects(
    cleanupKnowledgeSourceAssets(fileSource, {
      internalApiKey: "",
      deleteObjectImpl: async () => {
        actions.push("storage");
      },
      fetchImpl: async () => {
        actions.push("vectors");
        return new Response(null, { status: 204 });
      },
    }),
    { statusCode: 503, code: "KB_CLEANUP_NOT_CONFIGURED" },
  );
  assert.deepEqual(actions, []);
});

test("cleanup preserves the source file when AI is unreachable, unauthorized or returns a missing route", async () => {
  for (const failure of [401, 403, 404, 500, "network"] as const) {
    const actions: string[] = [];
    await assert.rejects(
      cleanupKnowledgeSourceAssets(fileSource, {
        internalApiKey: "test-key",
        deleteObjectImpl: async () => {
          actions.push("storage");
        },
        fetchImpl: async () => {
          actions.push("vectors");
          if (failure === "network") throw new TypeError("fetch failed");
          return new Response("upstream failure", { status: failure });
        },
      }),
      { statusCode: 502, code: "KB_VECTOR_CLEANUP_FAILED" },
    );
    assert.deepEqual(actions, ["vectors"]);
  }
});

test("cleanup removes vectors before source storage and includes a request timeout", async () => {
  const actions: string[] = [];
  await cleanupKnowledgeSourceAssets(fileSource, {
    internalApiKey: "test-key",
    deleteObjectImpl: async (key) => {
      assert.equal(key, fileSource.storagePath);
      actions.push("storage");
    },
    fetchImpl: async (_url, init) => {
      assert.ok(init?.signal);
      actions.push("vectors");
      return new Response(null, { status: 204 });
    },
  });
  assert.deepEqual(actions, ["vectors", "storage"]);
});

test("cleanup reports storage failure without claiming deletion succeeded", async () => {
  await assert.rejects(
    cleanupKnowledgeSourceAssets(fileSource, {
      internalApiKey: "test-key",
      deleteObjectImpl: async () => {
        throw new Error("access denied");
      },
      fetchImpl: async () => new Response(null, { status: 204 }),
    }),
    { statusCode: 502, code: "KB_STORAGE_CLEANUP_FAILED" },
  );
});
