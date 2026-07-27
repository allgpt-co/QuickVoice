import { CallStatus } from "../../../prisma/generated/prisma/client.js";
import * as dashboardRepository from "./dashboard.repository.js";
import { dashboardMetricRegistry } from "./dashboard.metrics.js";
import type {
  DashboardRange,
  DashboardSummaryArgs,
} from "./dashboard.schema.js";

type AnalyticsCall = Awaited<
  ReturnType<typeof dashboardRepository.listAnalyticsCalls>
>[number];

type Bucket = {
  t: string;
  calls: number;
  minutes: number;
  completed: number;
  failed: number;
  missed: number;
  successRate: number;
};

const STATUSES = [
  CallStatus.COMPLETED,
  CallStatus.FAILED,
  CallStatus.NOT_ANSWERED,
  CallStatus.IN_PROGRESS,
  CallStatus.SCHEDULED,
  CallStatus.PROCESSED,
];

function diffDays(start: Date, end: Date) {
  return Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  );
}

function rangeConfig(args: DashboardSummaryArgs) {
  const currentTime = new Date();

  if (args.range === "custom" && args.from && args.to) {
    const start = floorDay(args.from);
    const inclusiveEnd = floorDay(args.to);
    const end = new Date(inclusiveEnd);
    end.setDate(end.getDate() + 1);
    const queryEnd = end > currentTime ? currentTime : end;
    const days = diffDays(start, end);
    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - days);

    return {
      now: queryEnd,
      start,
      end,
      previousStart,
      bucket: "day" as const,
      count: days,
    };
  }

  if (args.range === "24h") {
    const end = floorHour(currentTime);
    end.setHours(end.getHours() + 1);
    const start = new Date(end);
    start.setHours(start.getHours() - 24);
    const previousStart = new Date(start);
    previousStart.setHours(previousStart.getHours() - 24);
    return {
      now: currentTime,
      start,
      end,
      previousStart,
      bucket: "hour" as const,
      count: 24,
    };
  }

  const days = args.range === "7d" ? 7 : 30;
  const start = floorDay(currentTime);
  start.setDate(start.getDate() - (days - 1));
  const end = new Date(floorDay(currentTime));
  end.setDate(end.getDate() + 1);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);
  return {
    now: currentTime,
    start,
    end,
    previousStart,
    bucket: "day" as const,
    count: days,
  };
}

function floorHour(date: Date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function floorDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketKey(date: Date, bucket: "hour" | "day") {
  return (bucket === "hour" ? floorHour(date) : floorDay(date)).toISOString();
}

function buildBuckets(start: Date, count: number, bucket: "hour" | "day") {
  const buckets: Bucket[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start);
    if (bucket === "hour") {
      d.setHours(d.getHours() + i);
    } else {
      d.setDate(d.getDate() + i);
    }
    buckets.push({
      t: d.toISOString(),
      calls: 0,
      minutes: 0,
      completed: 0,
      failed: 0,
      missed: 0,
      successRate: 0,
    });
  }
  return buckets;
}

function summarize(calls: AnalyticsCall[]) {
  const totalCalls = calls.length;
  const totalSeconds = calls.reduce(
    (sum, call) => sum + (call.durationSeconds ?? 0),
    0
  );
  const completed = calls.filter((call) => call.status === CallStatus.COMPLETED)
    .length;
  const failed = calls.filter((call) => call.status === CallStatus.FAILED).length;
  const missed = calls.filter((call) => call.status === CallStatus.NOT_ANSWERED)
    .length;

  return {
    calls: totalCalls,
    minutes: Math.round(totalSeconds / 60),
    avgDurationSeconds: totalCalls ? Math.round(totalSeconds / totalCalls) : 0,
    successRate: totalCalls ? completed / totalCalls : 0,
    failedCalls: failed,
    missedCalls: missed,
  };
}

function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function buildSeries(calls: AnalyticsCall[], range: ReturnType<typeof rangeConfig>) {
  const buckets = buildBuckets(range.start, range.count, range.bucket);
  const map = new Map(buckets.map((bucket) => [bucket.t, bucket]));

  for (const call of calls) {
    if (!call.startTime) continue;
    const key = bucketKey(call.startTime, range.bucket);
    const bucket = map.get(key);
    if (!bucket) continue;
    bucket.calls += 1;
    bucket.minutes += Math.round((call.durationSeconds ?? 0) / 60);
    if (call.status === CallStatus.COMPLETED) bucket.completed += 1;
    if (call.status === CallStatus.FAILED) bucket.failed += 1;
    if (call.status === CallStatus.NOT_ANSWERED) bucket.missed += 1;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    successRate: bucket.calls ? bucket.completed / bucket.calls : 0,
  }));
}

function buildStatusBreakdown(calls: AnalyticsCall[]) {
  return STATUSES.map((status) => ({
    status,
    count: calls.filter((call) => call.status === status).length,
  }));
}

function buildDirectionBreakdown(calls: AnalyticsCall[]) {
  const inbound = calls.filter((call) => call.direction === "inbound").length;
  const outbound = calls.filter((call) => call.direction === "outbound").length;
  const unknown = calls.length - inbound - outbound;
  return [
    { direction: "inbound", count: inbound },
    { direction: "outbound", count: outbound },
    { direction: "unknown", count: unknown },
  ];
}

function buildTopAgents(calls: AnalyticsCall[]) {
  const map = new Map<
    string | null,
    { agentId: string | null; calls: number; minutes: number; completed: number }
  >();

  for (const call of calls) {
    const bucket = map.get(call.agentId) ?? {
      agentId: call.agentId,
      calls: 0,
      minutes: 0,
      completed: 0,
    };
    bucket.calls += 1;
    bucket.minutes += Math.round((call.durationSeconds ?? 0) / 60);
    if (call.status === CallStatus.COMPLETED) bucket.completed += 1;
    map.set(call.agentId, bucket);
  }

  return Array.from(map.values())
    .map((agent) => ({
      agentId: agent.agentId,
      calls: agent.calls,
      minutes: agent.minutes,
      successRate: agent.calls ? agent.completed / agent.calls : 0,
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5);
}

export const getDashboardSummary = async (args: DashboardSummaryArgs) => {
  const range = rangeConfig(args);
  const [analyticsCalls, recent] = await Promise.all([
    dashboardRepository.listAnalyticsCalls({
      organizationId: args.organizationId,
      from: range.previousStart,
      to: range.now,
    }),
    dashboardRepository.listRecentCalls(args.organizationId),
  ]);

  const currentCalls = analyticsCalls.filter(
    (call) => call.startTime && call.startTime >= range.start
  );
  const previousCalls = analyticsCalls.filter(
    (call) => call.startTime && call.startTime < range.start
  );

  const totals = summarize(currentCalls);
  const previous = summarize(previousCalls);

  return {
    range: args.range,
    period: {
      from: range.start.toISOString(),
      to: range.now.toISOString(),
      previousFrom: range.previousStart.toISOString(),
      previousTo: range.start.toISOString(),
    },
    totals,
    metrics: dashboardMetricRegistry,
    deltas: {
      calls: delta(totals.calls, previous.calls),
      minutes: delta(totals.minutes, previous.minutes),
      avgDurationSeconds: delta(
        totals.avgDurationSeconds,
        previous.avgDurationSeconds
      ),
      successRate: delta(totals.successRate, previous.successRate),
      failedCalls: delta(totals.failedCalls, previous.failedCalls),
      missedCalls: delta(totals.missedCalls, previous.missedCalls),
    },
    series: buildSeries(currentCalls, range),
    statusBreakdown: buildStatusBreakdown(currentCalls),
    directionBreakdown: buildDirectionBreakdown(currentCalls),
    topAgents: buildTopAgents(currentCalls),
    recent,
  };
};
