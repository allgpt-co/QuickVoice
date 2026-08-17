import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteKbDocumentVectors,
  processKbDocuments,
} from "../../src/modules/kb/kb-processing-client.js";
import { assertKbProcessingSucceeded } from "../../src/modules/kb/kb-processing-result.js";

test("processKbDocuments polls async AI jobs until terminal document results", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const responses = [
    Response.json(
      {
        success: true,
        jobId: "kbjob_123",
        status: "queued",
        statusUrl: "/kb/jobs/kbjob_123",
      },
      { status: 202 },
    ),
    Response.json({
      jobId: "kbjob_123",
      status: "running",
      documents: [{ kbId: "kb_1", status: "processing" }],
    }),
    Response.json({
      jobId: "kbjob_123",
      status: "succeeded",
      documents: [{ kbId: "kb_1", status: "ok" }],
    }),
  ];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const response = responses.shift();
    assert.ok(response, "unexpected extra fetch call");
    return response;
  };

  const body = await processKbDocuments({
    aiApiUrl: "http://ai.local/",
    internalApiKey: "internal-key",
    payload: {
      agentId: "agent_1",
      organizationId: "org_1",
      documents: [
        {
          kbId: "kb_1",
          name: "FAQ",
          sourceType: "URL",
          url: "https://example.com/faq",
        },
      ],
    },
    fetchImpl,
    pollIntervalMs: 0,
    timeoutMs: 1_000,
  });

  assert.deepEqual(
    calls.map((call) => ({ url: call.url, method: call.method })),
    [
      { url: "http://ai.local/kb/process", method: "POST" },
      { url: "http://ai.local/kb/jobs/kbjob_123", method: "GET" },
      { url: "http://ai.local/kb/jobs/kbjob_123", method: "GET" },
    ],
  );
  assert.deepEqual(calls[0].body, {
    agentId: "agent_1",
    organizationId: "org_1",
    documents: [
      {
        kbId: "kb_1",
        name: "FAQ",
        sourceType: "URL",
        url: "https://example.com/faq",
      },
    ],
  });
  assert.doesNotThrow(() => assertKbProcessingSucceeded(body, ["kb_1"]));
});


test("deleteKbDocumentVectors removes the previous agent namespace before reprocessing", async () => {
  const calls: Array<{ url: string; method: string; key: string | null }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      key: headers.get("x-internal-key"),
    });
    return Response.json({ success: true });
  };

  await deleteKbDocumentVectors({
    aiApiUrl: "http://ai.local/",
    internalApiKey: "internal-key",
    agentId: "agent/previous",
    kbId: "kb source",
    fetchImpl,
  });

  assert.deepEqual(calls, [
    {
      url: "http://ai.local/kb/agent%2Fprevious/kb%20source",
      method: "DELETE",
      key: "internal-key",
    },
  ]);
});
