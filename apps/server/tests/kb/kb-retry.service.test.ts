import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestError } from "../../src/common/errors/badRequest.js";
import {
  createKnowledgeSources,
  retryKnowledgeSource,
} from "../../src/modules/kb/kb.service.js";

const SOURCE = {
  kbId: "kb-source-1",
  organizationId: "org-1",
  userId: "user-1",
  agentId: "agent-1",
  name: "Pricing guide",
  originalFileName: "pricing.pdf",
  storagePath: "kb/org-1/123e4567-e89b-42d3-a456-426614174000.pdf",
  sourceType: "PDF",
  status: "ERROR",
  metadata: { jobId: "kb-old", retryCount: 2 },
  lastIndexedAt: null,
  uploadedAt: new Date("2026-07-26T10:00:00.000Z"),
};

test("createKnowledgeSources queues one isolated job per document", async () => {
  const queued: Array<Record<string, unknown>> = [];
  const generatedIds = ["kb-job-1", "kb-job-2"];
  let nextJobId = 0;
  const documents = [
    {
      name: "Pricing",
      sourceType: "PDF" as const,
      s3Key: "kb/org-1/123e4567-e89b-42d3-a456-426614174000.pdf",
      originalFileName: "pricing.pdf",
    },
    {
      name: "Support",
      sourceType: "TXT" as const,
      s3Key: "kb/org-1/123e4567-e89b-42d3-a456-426614174001.txt",
      originalFileName: "support.txt",
    },
  ];

  await createKnowledgeSources(
    {
      organizationId: "org-1",
      userId: "user-1",
      agentId: "agent-1",
      documents,
    },
    {
      createJobId: () => generatedIds[nextJobId++]!,
      repository: {
        createKnowledgeSources: async (_args, jobIds) => ({
          rows: documents.map((document, index) => ({
            kbId: `kb-source-${index + 1}`,
            sourceType: document.sourceType,
            name: document.name,
            metadata: { jobId: jobIds[index] },
          })),
          docs: documents.map((document) => ({
            name: document.name,
            url: null,
            s3Key: document.s3Key,
          })),
        }),
        markError: async () => undefined,
      } as never,
      queue: {
        add: async () => undefined,
        addBulk: async (jobs: Array<Record<string, unknown>>) => {
          queued.push(...jobs);
        },
      },
    },
  );

  assert.equal(queued.length, 2);
  assert.deepEqual(
    queued.map((job) => (job.opts as { jobId: string }).jobId),
    generatedIds,
  );
  assert.deepEqual(
    queued.map((job) => (job.data as { kbIds: string[] }).kbIds),
    [["kb-source-1"], ["kb-source-2"]],
  );
});

test("createKnowledgeSources marks every source failed when enqueueing fails", async () => {
  const errors: unknown[][] = [];
  const document = {
    name: "Pricing",
    sourceType: "PDF" as const,
    s3Key: "kb/org-1/123e4567-e89b-42d3-a456-426614174000.pdf",
    originalFileName: "pricing.pdf",
  };

  await assert.rejects(
    createKnowledgeSources(
      {
        organizationId: "org-1",
        userId: "user-1",
        agentId: "agent-1",
        documents: [document],
      },
      {
        createJobId: () => "kb-job-1",
        repository: {
          createKnowledgeSources: async () => ({
            rows: [
              {
                kbId: "kb-source-1",
                sourceType: "PDF",
                name: "Pricing",
              },
            ],
            docs: [
              {
                name: "Pricing",
                url: null,
                s3Key: document.s3Key,
              },
            ],
          }),
          markError: async (...args: unknown[]) => {
            errors.push(args);
          },
        } as never,
        queue: {
          add: async () => undefined,
          addBulk: async () => {
            throw new Error("Redis unavailable");
          },
        },
      },
    ),
    /Redis unavailable/,
  );

  assert.deepEqual(errors, [
    [
      ["kb-source-1"],
      "The document could not be queued for processing.",
      "kb-job-1",
      "org-1",
    ],
  ]);
});

test("retryKnowledgeSource atomically claims a failed source and queues its stored document", async () => {
  const calls: unknown[][] = [];
  const result = await retryKnowledgeSource("org-1", "kb-source-1", {
    createJobId: () => "kb-new",
    repository: {
      getByIdForOrg: async () => SOURCE,
      claimRetry: async (...args: unknown[]) => {
        calls.push(["claim", ...args]);
        return true;
      },
      markError: async (...args: unknown[]) => {
        calls.push(["error", ...args]);
      },
    } as never,
    queue: {
      add: async (...args: unknown[]) => {
        calls.push(["queue", ...args]);
      },
    } as never,
  });

  assert.equal(result.status, "PROCESSING");
  assert.deepEqual(result.metadata, {
    jobId: "kb-new",
    stage: "queued",
    progress: { processed: 0, total: 1, percent: 0 },
    queuedAt: result.metadata.queuedAt,
    retryCount: 3,
    retryOfJobId: "kb-old",
  });

  const claim = calls.find((call) => call[0] === "claim");
  assert.equal(claim?.[1], "kb-source-1");
  assert.equal(claim?.[2], "org-1");

  const queued = calls.find((call) => call[0] === "queue");
  assert.equal(queued?.[1], "process");
  assert.deepEqual((queued?.[2] as { kbIds: string[] }).kbIds, ["kb-source-1"]);
  assert.deepEqual(queued?.[3], { jobId: "kb-new" });
});

test("retryKnowledgeSource rejects a concurrent retry that lost the claim", async () => {
  await assert.rejects(
    retryKnowledgeSource("org-1", "kb-source-1", {
      createJobId: () => "kb-new",
      repository: {
        getByIdForOrg: async () => SOURCE,
        claimRetry: async () => false,
        markError: async () => undefined,
      } as never,
      queue: {
        add: async () => undefined,
      } as never,
    }),
    BadRequestError,
  );
});

test("retryKnowledgeSource restores ERROR when queueing fails", async () => {
  const errors: unknown[][] = [];

  await assert.rejects(
    retryKnowledgeSource("org-1", "kb-source-1", {
      createJobId: () => "kb-new",
      repository: {
        getByIdForOrg: async () => SOURCE,
        claimRetry: async () => true,
        markError: async (...args: unknown[]) => {
          errors.push(args);
        },
      } as never,
      queue: {
        add: async () => {
          throw new Error("Redis unavailable");
        },
      } as never,
    }),
    /Redis unavailable/,
  );

  assert.deepEqual(errors, [
    [
      ["kb-source-1"],
      "The document could not be queued for processing.",
      "kb-new",
      "org-1",
    ],
  ]);
});
