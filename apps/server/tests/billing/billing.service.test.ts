import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "../../src/config/prisma.js";
import { getBillingUsage } from "../../src/modules/billing/billing.service.js";

const originalTransaction = prisma.$transaction.bind(prisma);

afterEach(() => {
  prisma.$transaction = originalTransaction;
});

test("billing usage uses subscription periods and derives remaining minutes", async () => {
  prisma.$transaction = (async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      organization: {
        findUnique: async () => ({ plan: "free" }),
      },
      subscription: {
        findFirst: async () => ({
          plan: "starter",
          status: "active",
          periodStart: new Date("2026-07-10T00:00:00.000Z"),
          periodEnd: new Date("2026-08-10T00:00:00.000Z"),
        }),
      },
      callLog: {
        aggregate: async () => ({
          _sum: { durationSeconds: 3_601 },
          _count: { _all: 12 },
        }),
      },
    })) as typeof prisma.$transaction;

  const usage = await getBillingUsage(
    "org_123",
    new Date("2026-07-26T12:00:00.000Z")
  );

  assert.equal(usage.plan, "starter");
  assert.equal(usage.includedMinutes, 245);
  assert.equal(usage.usedMinutes, 61);
  assert.equal(usage.remainingMinutes, 184);
  assert.equal(usage.overageMinutes, 0);
  assert.equal(usage.percentUsed, 24.9);
  assert.equal(usage.callCount, 12);
  assert.equal(usage.periodStart, "2026-07-10T00:00:00.000Z");
  assert.equal(usage.periodEnd, "2026-08-10T00:00:00.000Z");
});

test("billing usage falls back to the UTC month and reports overage", async () => {
  let aggregateWhere: unknown;
  prisma.$transaction = (async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      organization: {
        findUnique: async () => ({ plan: "free" }),
      },
      subscription: {
        findFirst: async () => null,
      },
      callLog: {
        aggregate: async (args: { where: unknown }) => {
          aggregateWhere = args.where;
          return {
            _sum: { durationSeconds: 1_200 },
            _count: { _all: 3 },
          };
        },
      },
    })) as typeof prisma.$transaction;

  const usage = await getBillingUsage(
    "org_123",
    new Date("2026-07-26T12:00:00.000Z")
  );

  assert.equal(usage.usedMinutes, 20);
  assert.equal(usage.remainingMinutes, 0);
  assert.equal(usage.overageMinutes, 5);
  assert.equal(usage.percentUsed, 133.3);
  assert.deepEqual(aggregateWhere, {
    organizationId: "org_123",
    deleted: false,
    startTime: {
      gte: new Date("2026-07-01T00:00:00.000Z"),
      lt: new Date("2026-08-01T00:00:00.000Z"),
    },
  });
});
