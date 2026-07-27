import { plans } from "../../../data/plans.js";
import prisma from "../../config/prisma.js";

export async function getBillingUsage(
  organizationId: string,
  now = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const [organization, subscription] = await Promise.all([
      tx.organization.findUnique({
        where: { id: organizationId },
        select: { plan: true },
      }),
      tx.subscription.findFirst({
        where: {
          referenceId: organizationId,
          status: { in: ["active", "trialing"] },
        },
        orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
        select: {
          plan: true,
          periodStart: true,
          periodEnd: true,
          status: true,
        },
      }),
    ]);

    const fallbackPeriod = utcMonthPeriod(now);
    const periodStart = subscription?.periodStart ?? fallbackPeriod.start;
    const periodEnd =
      subscription?.periodEnd && subscription.periodEnd > periodStart
        ? subscription.periodEnd
        : fallbackPeriod.end;
    const usage = await tx.callLog.aggregate({
      where: {
        organizationId,
        deleted: false,
        startTime: { gte: periodStart, lt: periodEnd },
      },
      _sum: { durationSeconds: true },
      _count: { _all: true },
    });

    const plan = subscription?.plan ?? organization?.plan ?? "free";
    const includedMinutes =
      plans.find((candidate) => candidate.id === plan)?.minutes ?? null;
    const usedSeconds = Math.max(0, usage._sum.durationSeconds ?? 0);
    const usedMinutes = Math.ceil(usedSeconds / 60);
    const remainingMinutes =
      includedMinutes === null
        ? null
        : Math.max(0, includedMinutes - usedMinutes);
    const overageMinutes =
      includedMinutes === null
        ? 0
        : Math.max(0, usedMinutes - includedMinutes);
    const percentUsed =
      includedMinutes === null
        ? null
        : includedMinutes === 0
          ? usedMinutes > 0
            ? 100
            : 0
          : Math.round((usedMinutes / includedMinutes) * 1000) / 10;

    return {
      plan: String(plan),
      subscriptionStatus: subscription?.status ?? null,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      includedMinutes,
      usedMinutes,
      usedSeconds,
      remainingMinutes,
      overageMinutes,
      percentUsed,
      callCount: usage._count._all,
    };
  });
}

function utcMonthPeriod(date: Date) {
  return {
    start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)),
  };
}
