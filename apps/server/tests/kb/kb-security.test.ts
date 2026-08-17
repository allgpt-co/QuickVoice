import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "../../src/config/prisma.js";
import { BadRequestError } from "../../src/common/errors/badRequest.js";
import {
  createKbApiSchema,
  updateKbApiSchema,
} from "../../src/modules/kb/kb.schema.js";
import * as kbRepository from "../../src/modules/kb/kb.repository.js";

const originalTransaction = prisma.$transaction.bind(prisma);

afterEach(() => {
  prisma.$transaction = originalTransaction;
});

test("createKbApiSchema accepts authenticated-context payloads without caller-supplied tenant ids", () => {
  const parsed = createKbApiSchema.parse({
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    userId: "attacker_user",
    organizationId: "attacker_org",
    documents: [
      {
        name: "Pricing",
        sourceType: "URL",
        url: "https://docs.quickvoice.test/pricing",
      },
    ],
  });

  assert.deepEqual(Object.keys(parsed).sort(), ["agentId", "documents"]);
});

test("createKnowledgeSources verifies the target agent belongs to the active organization before writes", async () => {
  const writes: unknown[] = [];
  prisma.$transaction = (async (
    callback: (tx: unknown) => Promise<unknown>,
  ) => {
    return callback({
      agent: {
        findFirst: async () => null,
      },
      knowledgeSource: {
        create: async (args: unknown) => {
          writes.push(args);
          return { kbId: "kb_1", name: "Pricing", sourceType: "URL" };
        },
      },
    });
  }) as typeof prisma.$transaction;

  await assert.rejects(
    kbRepository.createKnowledgeSources({
      organizationId: "org_123",
      userId: "user_123",
      agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
      documents: [
        {
          name: "Pricing",
          sourceType: "URL",
          url: "https://docs.quickvoice.test/pricing",
        },
      ],
    }),
    BadRequestError,
  );
  assert.equal(writes.length, 0);
});

test("updateKbApiSchema accepts editable fields and strips tenant identifiers", () => {
  const parsed = updateKbApiSchema.parse({
    name: "Updated pricing",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    url: "https://docs.quickvoice.test/new-pricing",
    organizationId: "attacker_org",
    userId: "attacker_user",
  });

  assert.deepEqual(Object.keys(parsed).sort(), ["agentId", "name", "url"]);
});

test("updateKbApiSchema rejects an empty update", () => {
  assert.throws(() => updateKbApiSchema.parse({}), /At least one field/);
});

test("prepareKnowledgeSourceUpdate rejects agents outside the active organization before writes", async () => {
  const writes: unknown[] = [];
  prisma.$transaction = (async (
    callback: (tx: unknown) => Promise<unknown>,
  ) => {
    return callback({
      knowledgeSource: {
        findFirst: async () => ({
          kbId: "kb_1",
          organizationId: "org_123",
          agentId: "old_agent",
          status: "ACTIVE",
        }),
        update: async (args: unknown) => {
          writes.push(args);
          return args;
        },
      },
      agent: {
        findFirst: async () => null,
      },
    });
  }) as typeof prisma.$transaction;

  await assert.rejects(
    kbRepository.prepareKnowledgeSourceUpdate({
      kbId: "kb_1",
      organizationId: "org_123",
      name: "Updated pricing",
      agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
      storagePath: "https://docs.quickvoice.test/new-pricing",
    }),
    BadRequestError,
  );
  assert.equal(writes.length, 0);
});

test("markActive derives the agent counter from active sources on every retry", async () => {
  const updates: unknown[] = [];
  prisma.$transaction = (async (
    callback: (tx: unknown) => Promise<unknown>,
  ) => {
    return callback({
      knowledgeSource: {
        updateMany: async () => ({ count: 2 }),
        count: async () => 7,
      },
      agent: {
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
    });
  }) as typeof prisma.$transaction;

  await kbRepository.markActive(["kb_1", "kb_2"], "agent_123");

  assert.deepEqual(updates, [
    {
      where: { agentId: "agent_123" },
      data: { knowledgeSourcesCount: 7 },
    },
  ]);
});

test("deleteKnowledgeSource synchronizes the counter instead of decrementing blindly", async () => {
  const updates: unknown[] = [];
  prisma.$transaction = (async (
    callback: (tx: unknown) => Promise<unknown>,
  ) => {
    return callback({
      knowledgeSource: {
        findFirst: async () => ({
          kbId: "kb_1",
          organizationId: "org_123",
          agentId: "agent_123",
          status: "ACTIVE",
        }),
        delete: async () => ({}),
        count: async () => 0,
      },
      agent: {
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
    });
  }) as typeof prisma.$transaction;

  await kbRepository.deleteKnowledgeSource("kb_1", "org_123");

  assert.deepEqual(updates, [
    {
      where: { agentId: "agent_123" },
      data: { knowledgeSourcesCount: 0 },
    },
  ]);
});
