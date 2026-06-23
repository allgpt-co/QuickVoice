"use client";

import Link from "next/link";
import { useId } from "react";
import { PhoneCall } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import type {
  DashboardRange,
  DashboardSeriesPoint,
  DashboardSummary,
} from "@/src/lib/api/resources/dashboard";

const config = {
  calls: { label: "Calls", color: "var(--chart-1)" },
  minutes: { label: "Minutes", color: "#10b981" },
  failed: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig;

function formatTick(iso: string, range: DashboardRange) {
  const d = new Date(iso);
  if (range === "24h") {
    return d.toLocaleTimeString([], { hour: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function totalFor(data: DashboardSeriesPoint[], key: keyof DashboardSeriesPoint) {
  return data.reduce((sum, point) => {
    const value = point[key];
    return typeof value === "number" ? sum + value : sum;
  }, 0);
}

export function VolumeChart({
  summary,
  range,
  loading,
}: {
  summary?: DashboardSummary;
  range: DashboardRange;
  loading?: boolean;
}) {
  const titleId = useId();
  const summaryId = useId();
  const bucketUnit = range === "24h" ? "hour" : "day";

  if (loading) {
    return (
      <div className="border bg-card p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const data = summary?.series ?? [];
  const peak = data.reduce((max, point) => Math.max(max, point.calls), 0);
  const calls = totalFor(data, "calls");
  const minutes = totalFor(data, "minutes");

  return (
    <div className="border bg-card" aria-labelledby={titleId}>
      <div className="flex flex-col gap-4 border-b p-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Traffic timeline
          </p>
          <h3
            id={titleId}
            className="mt-1 text-lg font-semibold tracking-tight text-foreground"
          >
            Calls, minutes, and outcome pressure
          </h3>
          <p id={summaryId} className="mt-1 text-sm text-muted-foreground">
            Bucketed by {bucketUnit}. X-axis shows {bucketUnit}; left axis shows
            calls and failed calls; right axis shows minutes.
          </p>
        </div>
        <div className="grid grid-cols-3 border bg-background text-center text-xs sm:min-w-96">
          <div className="border-r px-3 py-2">
            <p className="font-semibold text-foreground">{calls}</p>
            <p className="text-muted-foreground">calls</p>
          </div>
          <div className="border-r px-3 py-2">
            <p className="font-semibold text-foreground">{minutes}</p>
            <p className="text-muted-foreground">minutes</p>
          </div>
          <div className="px-3 py-2">
            <p className="font-semibold text-foreground">{peak}</p>
            <p className="text-muted-foreground">peak</p>
          </div>
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No calls yet in this range"
          description="Place a test call or connect a number to start building the traffic timeline."
          className="m-5 h-80 bg-background/40"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild size="sm">
                <Link href="/outbound">Place a test call</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/numbers">Connect number</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <ChartContainer
            config={config}
            className="h-[22rem] w-full p-5"
            role="group"
            aria-label="Traffic timeline chart"
          >
            <ComposedChart
              accessibilityLayer
              data={data}
              margin={{ top: 12, right: 44, left: 18, bottom: 28 }}
              aria-label="Calls, minutes, and failed calls over time"
              aria-describedby={summaryId}
            >
              <defs>
                <linearGradient
                  id="dashboard-minutes-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--color-minutes)"
                    stopOpacity={0.34}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-minutes)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
                vertical={false}
              />
              <XAxis
                dataKey="t"
                tickFormatter={(v) => formatTick(v, range)}
                stroke="currentColor"
                className="text-xs text-muted-foreground"
                tickLine={false}
                axisLine={false}
                label={{
                  value: bucketUnit === "hour" ? "Hour" : "Day",
                  position: "insideBottom",
                  offset: -18,
                }}
              />
              <YAxis
                yAxisId="left"
                stroke="currentColor"
                className="text-xs text-muted-foreground"
                tickLine={false}
                axisLine={false}
                width={42}
                label={{
                  value: `Calls by ${bucketUnit}`,
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="currentColor"
                className="text-xs text-muted-foreground"
                tickLine={false}
                axisLine={false}
                width={48}
                label={{
                  value: "Minutes (right axis)",
                  angle: 90,
                  position: "insideRight",
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => formatTick(String(v), range)}
                  />
                }
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="minutes"
                name="Minutes (right axis)"
                stroke="var(--color-minutes)"
                strokeWidth={2}
                fill="url(#dashboard-minutes-fill)"
              />
              <Bar
                yAxisId="left"
                dataKey="calls"
                name={`Calls by ${bucketUnit}`}
                fill="var(--color-calls)"
                barSize={16}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="failed"
                name="Failed calls"
                stroke="var(--color-failed)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
          <ul
            className="grid gap-2 px-5 pb-5 text-xs text-muted-foreground sm:grid-cols-3"
            aria-label="Traffic timeline legend"
          >
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-4 w-2 border border-primary bg-primary"
              />
              <span>Calls by {bucketUnit} - bar series</span>
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-3 w-5 border border-emerald-500 bg-emerald-500/20"
              />
              <span>Minutes (right axis) - shaded area</span>
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-px w-6 border-t-2 border-destructive"
              />
              <span>Failed calls - line series</span>
            </li>
          </ul>
          <div className="sr-only">
            <table aria-describedby={summaryId}>
              <caption>Traffic timeline data table</caption>
              <thead>
                <tr>
                  <th scope="col">{bucketUnit}</th>
                  <th scope="col">Calls</th>
                  <th scope="col">Minutes</th>
                  <th scope="col">Failed calls</th>
                </tr>
              </thead>
              <tbody>
                {data.map((point) => (
                  <tr key={point.t}>
                    <th scope="row">{formatTick(point.t, range)}</th>
                    <td>{point.calls}</td>
                    <td>{point.minutes}</td>
                    <td>{point.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
