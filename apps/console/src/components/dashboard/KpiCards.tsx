"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  PhoneCall,
  TrendingDown,
  TrendingUp,
  Timer,
  Voicemail,
} from "lucide-react";
import { StatCard } from "@/src/components/common/StatCard";
import { dashboardCallsHref } from "@/src/components/dashboard/call-filter-links";
import type {
  DashboardRange,
  DashboardSummary,
} from "@/src/lib/api/resources/dashboard";

const PREVIOUS_PERIOD_LABELS: Record<DashboardSummary["range"], string> = {
  "24h": "previous 24 hours",
  "7d": "previous 7 days",
  "30d": "previous 30 days",
};

const PERIOD_BOUNDARY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  timeZone: "UTC",
});

type DeltaUnit = "call" | "minute" | "second" | "percentage point";

function formatDuration(seconds: number) {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatPeriodBoundary(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return PERIOD_BOUNDARY_FORMAT.format(date);
}

function formatPreviousPeriodLabel(summary?: DashboardSummary) {
  if (!summary) return "selected comparison period";

  const rangeLabel = PREVIOUS_PERIOD_LABELS[summary.range];
  const previousFrom = formatPeriodBoundary(summary.period.previousFrom);
  const previousTo = formatPeriodBoundary(summary.period.previousTo);

  if (!previousFrom || !previousTo) return rangeLabel;
  return `${rangeLabel}, ${previousFrom} to ${previousTo} UTC`;
}

function normalizeDeltaValue(value: number | undefined, unit: DeltaUnit) {
  const n = value ?? 0;
  const amount =
    unit === "percentage point" && Math.abs(n) <= 1 ? n * 100 : n;

  return Math.abs(amount) < 0.05 ? 0 : amount;
}

function formatDeltaAmount(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
}

function formatDeltaCopy(value: number | undefined, unit: DeltaUnit) {
  const amount = normalizeDeltaValue(value, unit);
  const sign = amount > 0 ? "+" : "";
  const unitLabel = Math.abs(amount) === 1 ? unit : `${unit}s`;

  return `${sign}${formatDeltaAmount(amount)} ${unitLabel}`;
}

function Trend({
  value,
  unit,
  comparisonLabel,
  inverse = false,
}: {
  value?: number;
  unit: DeltaUnit;
  comparisonLabel: string;
  inverse?: boolean;
}) {
  const n = normalizeDeltaValue(value, unit);
  const positive = n >= 0;
  const good = inverse ? n <= 0 : n >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span
      className={
        good
          ? "inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300"
          : "inline-flex items-center gap-1 text-destructive"
      }
    >
      <Icon className="size-3" />
      {formatDeltaCopy(value, unit)} vs {comparisonLabel}
    </span>
  );
}

function InvestigationHint({
  action,
  children,
}: {
  action: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {children}
      <span className="inline-flex items-center gap-1 text-primary">
        {action} <ArrowRight className="size-3" />
      </span>
    </div>
  );
}

const drilldownLinkClass =
  "block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function KpiCards({
  summary,
  range,
  loading,
}: {
  summary?: DashboardSummary;
  range: DashboardRange;
  loading?: boolean;
}) {
  const totals = summary?.totals;
  const deltas = summary?.deltas;
  const previousPeriodLabel = formatPreviousPeriodLabel(summary);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
      <StatCard
        label="Total calls"
        value={totals?.calls.toLocaleString() ?? "0"}
        eyebrow="All inbound and outbound activity"
        helper={
          deltas ? (
            <Trend
              value={deltas.calls}
              unit="call"
              comparisonLabel={previousPeriodLabel}
            />
          ) : undefined
        }
        icon={PhoneCall}
        loading={loading}
        tone="info"
        className="xl:col-span-3"
      />
      <StatCard
        label="Minutes used"
        value={totals?.minutes.toLocaleString() ?? "0"}
        eyebrow="Connected conversation time"
        helper={
          deltas ? (
            <Trend
              value={deltas.minutes}
              unit="minute"
              comparisonLabel={previousPeriodLabel}
            />
          ) : undefined
        }
        icon={Clock}
        loading={loading}
        tone="neutral"
        className="xl:col-span-2"
      />
      <StatCard
        label="Avg duration"
        value={formatDuration(totals?.avgDurationSeconds ?? 0)}
        eyebrow="Per completed interaction"
        helper={
          deltas ? (
            <Trend
              value={deltas.avgDurationSeconds}
              unit="second"
              comparisonLabel={previousPeriodLabel}
            />
          ) : undefined
        }
        icon={Timer}
        loading={loading}
        tone="warning"
        className="xl:col-span-2"
      />
      <StatCard
        label="Success rate"
        value={`${Math.round((totals?.successRate ?? 0) * 100)}%`}
        eyebrow="Completed calls out of total"
        helper={
          deltas ? (
            <Trend
              value={deltas.successRate}
              unit="percentage point"
              comparisonLabel={previousPeriodLabel}
            />
          ) : undefined
        }
        icon={CheckCircle2}
        loading={loading}
        tone="success"
        className="xl:col-span-2"
      />
      <div className="grid grid-cols-2 gap-4 xl:col-span-3">
        <Link
          href={dashboardCallsHref({ range, status: "FAILED" })}
          className={drilldownLinkClass}
          aria-label="Review failed calls in the selected dashboard range"
        >
          <StatCard
            label="Failed"
            value={totals?.failedCalls.toLocaleString() ?? "0"}
            helper={
              <InvestigationHint action="Review failed calls">
                {deltas ? (
                  <Trend
                    value={deltas.failedCalls}
                    unit="call"
                    comparisonLabel={previousPeriodLabel}
                    inverse
                  />
                ) : null}
              </InvestigationHint>
            }
            icon={AlertTriangle}
            loading={loading}
            tone="danger"
            className="h-full"
          />
        </Link>
        <Link
          href={dashboardCallsHref({ range, status: "NOT_ANSWERED" })}
          className={drilldownLinkClass}
          aria-label="View missed calls in the selected dashboard range"
        >
          <StatCard
            label="Missed"
            value={totals?.missedCalls.toLocaleString() ?? "0"}
            helper={
              <InvestigationHint action="View missed calls">
                {deltas ? (
                  <Trend
                    value={deltas.missedCalls}
                    unit="call"
                    comparisonLabel={previousPeriodLabel}
                    inverse
                  />
                ) : null}
              </InvestigationHint>
            }
            icon={Voicemail}
            loading={loading}
            tone="warning"
            className="h-full"
          />
        </Link>
      </div>
    </div>
  );
}
