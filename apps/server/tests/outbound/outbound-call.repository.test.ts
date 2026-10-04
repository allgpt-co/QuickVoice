import assert from "node:assert/strict";
import { test } from "node:test";

import prisma from "../../src/config/prisma.js";
import { claimCampaignDispatchSlots, listForOrg } from "../../src/modules/outbound/outbound-call.repository.js";

test("outbound cursor pagination has a deterministic unique tie-breaker", async (t) => {
  let query: Record<string, unknown> | undefined;
  const originalFindMany = prisma.outboundCall.findMany;
  const originalCount = prisma.outboundCall.count;
  const originalTransaction = prisma.$transaction;

  prisma.outboundCall.findMany = ((args: Record<string, unknown>) => {
    query = args;
    return Promise.resolve([]);
  }) as typeof prisma.outboundCall.findMany;
  prisma.outboundCall.count = (() =>
    Promise.resolve(0)) as typeof prisma.outboundCall.count;
  prisma.$transaction = ((operations: Promise<unknown>[]) =>
    Promise.all(operations)) as typeof prisma.$transaction;
  t.after(() => {
    prisma.outboundCall.findMany = originalFindMany;
    prisma.outboundCall.count = originalCount;
    prisma.$transaction = originalTransaction;
  });

  await listForOrg({
    organizationId: "org_123",
    limit: 20,
    cursor: "outbound_123",
  });

  assert.deepEqual(query?.orderBy, [
    { createdAt: "desc" },
    { outboundId: "desc" },
  ]);
  assert.deepEqual(query?.cursor, { outboundId: "outbound_123" });
  assert.equal(query?.skip, 1);
});


for (const [active, daily, expected] of [[0, 0, 10], [8, 0, 2], [0, 99, 1], [10, 0, 0], [0, 100, 0]]) {
  test(`10,000 recipients reserve only free slots (active=${active}, daily=${daily})`, async (t) => {
    let reserved = 0;
    let locked = false;
    let recipientQueries = 0;
    const originalTransaction = prisma.$transaction;
    const tx = {
      campaign: { findFirst: async () => ({ agentId: "agent_123" }) },
      agentConfiguration: { findUnique: async () => {
        assert.equal(locked, true, "lock the agent before reading capacity");
        return { concurrent_calls_limit: 10, daily_calls_limit: 100 };
      } },
      $queryRaw: async (query: TemplateStringsArray) => {
        const sql = query.join("?");
        if (sql.includes("FOR UPDATE")) { locked = true; return []; }
        return [{ count: (sql.includes("active_calls") ? active! : daily!) + reserved }];
      },
      $executeRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
        assert.doesNotMatch(query.join("?"), /now\(\)|CURRENT_TIMESTAMP/i);
        assert.ok(values.some((value) => value instanceof Date), "dispatch time is bound as a UTC Date");
        return reserved;
      },
      outboundCall: {
        findMany: async ({ take, where }: any) => {
          if (where.status === "PROCESSED") {
            return Array.from({ length: reserved }, (_, index) => ({ outboundId: `outbound_${index}` }));
          }
          recipientQueries++;
          assert.equal(locked, true);
          assert.equal(where.campaignId, "campaign_123");
          assert.equal(where.status, "SCHEDULED");
          assert.equal(take, expected);
          return Array.from({ length: take }, (_, index) => ({ outboundId: `outbound_${index}` }));
        },
        updateMany: async ({ where, data }: any) => {
          assert.equal(data.status, "PROCESSED");
          reserved += where.outboundId.in.length;
          return { count: where.outboundId.in.length };
        },
        count: async ({ where }: any) => where.status === "SCHEDULED" ? 10_000 - reserved : reserved,
      },
    };
    prisma.$transaction = (async (fn: (client: typeof tx) => Promise<unknown>) => {
      locked = false;
      return fn(tx);
    }) as typeof prisma.$transaction;
    t.after(() => { prisma.$transaction = originalTransaction; });

    const first = await claimCampaignDispatchSlots("campaign_123");
    assert.equal(first?.outboundIds.length, expected);
    assert.equal(first?.scheduledRemaining, 10_000 - expected!);
    const next = await claimCampaignDispatchSlots("campaign_123");
    assert.deepEqual(next?.outboundIds, first?.outboundIds, "retry recovers the same claims without reserving more capacity");
    assert.equal(next?.scheduledRemaining, 10_000 - expected!);
    assert.equal(recipientQueries, expected ? 1 : 0, "blocked recipients are not fetched for enqueueing");
  });
}

test("campaign completion cannot overwrite cancellation", async (t) => {
  const { markCampaignCompleted } = await import("../../src/modules/outbound/outbound-call.repository.js");
  const original = prisma.campaign.updateMany;
  let status = "CANCELLED";
  prisma.campaign.updateMany = (async ({ where, data }: any) => {
    if (!where.status || where.status === status) { status = data.status; return { count: 1 }; }
    return { count: 0 };
  }) as any;
  t.after(() => { prisma.campaign.updateMany = original; });
  assert.equal((await markCampaignCompleted("cancelled_campaign")).count, 0);
  assert.equal(status, "CANCELLED");
  status = "ACTIVE";
  assert.equal((await markCampaignCompleted("active_campaign")).count, 1);
  assert.equal(status, "COMPLETED");
});
