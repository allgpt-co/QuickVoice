"use client";

import { useId } from "react";
import Link from "next/link";
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ArrowRight, PhoneCall } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import { dashboardCallsHref } from "@/src/components/dashboard/call-filter-links";
import type {
  DashboardRange,
  DashboardSummary,
} from "@/src/lib/api/resources/dashboard";

const statusConfig = {
  count: { label: "Calls", color: "var(--chart-1)" },
} satisfies ChartConfig;

const directionConfig = {
  inbound: { label: "Inbound", color: "var(--chart-2)" },
  outbound: { label: "Outbound", color: "var(--chart-4)" },
  unknown: { label: "Unknown", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

const directionColors = {
  inbound: "var(--color-inbound)",
  outbound: "var(--color-outbound)",
  unknown: "var(--color-unknown)",
};

const statusColors: Record<string, string> = {
  COMPLETED: "#10b981",
  FAILED: "var(--destructive)",
  NOT_ANSWERED: "#f59e0b",
  IN_PROGRESS: "var(--chart-1)",
  SCHEDULED: "var(--chart-3)",
  PROCESSED: "var(--chart-4)",
};

const statusPattern: Record<string, string> = {
  COMPLETED: "solid bar",
  FAILED: "dashed bar",
  NOT_ANSWERED: "dotted bar",
  IN_PROGRESS: "striped bar",
  SCHEDULED: "outlined bar",
  PROCESSED: "double-line bar",
};

const directionPattern = {
  inbound: "filled segment",
  outbound: "outlined segment",
  unknown: "dashed segment",
};

function labelStatus(status: string) {
  return status.toLowerCase().replace("_", " ");
}

function percent(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0;
}

export function BreakdownCharts({
  summary,
  range,
  loading,
}: {
  summary?: DashboardSummary;
  range: DashboardRange;
  loading?: boolean;
}) {
  const statusTitleId = useId();
  const statusSummaryId = useId();
  const directionTitleId = useId();
  const directionSummaryId = useId();

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const statusData = summary?.statusBreakdown.filter((item) => item.count > 0) ?? [];
  const directionData =
    summary?.directionBreakdown.filter((item) => item.count > 0) ?? [];
  const totalStatus = statusData.reduce((sum, item) => sum + item.count, 0);
  const inbound =
    directionData.find((item) => item.direction === "inbound")?.count ?? 0;
  const outbound =
    directionData.find((item) => item.direction === "outbound")?.count ?? 0;
  const directionTotal = inbound + outbound;
  const inboundPct = directionTotal
    ? Math.round((inbound / directionTotal) * 100)
    : 0;
  const statusChartData = statusData.map((item) => ({
    ...item,
    label: labelStatus(item.status),
    pattern: statusPattern[item.status] ?? "solid bar",
    percentage: percent(item.count, totalStatus),
  }));
  const directionChartData = directionData.map((item) => ({
    ...item,
    label: item.direction,
    pattern: directionPattern[item.direction],
    percentage: percent(item.count, directionTotal),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="border bg-card p-5" aria-labelledby={statusTitleId}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Outcomes
            </p>
            <h3
              id={statusTitleId}
              className="mt-1 text-base font-semibold text-foreground"
            >
              Call outcomes
            </h3>
            <p id={statusSummaryId} className="text-xs text-muted-foreground">
              Status distribution for the selected range. X-axis shows calls;
              Y-axis shows call status.
            </p>
          </div>
          <div className="border bg-background px-3 py-2 text-right">
            <p className="text-sm font-semibold text-foreground">{totalStatus}</p>
            <p className="text-xs text-muted-foreground">tracked</p>
          </div>
        </div>
        {statusData.length ? (
          <>
            <ChartContainer
              config={statusConfig}
              className="h-64 w-full"
              role="group"
              aria-label="Call outcome status breakdown chart"
            >
              <BarChart
                accessibilityLayer
                data={statusChartData}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 18, bottom: 24 }}
                aria-label="Call outcome status breakdown chart"
                aria-describedby={statusSummaryId}
              >
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs text-muted-foreground"
                  label={{
                    value: "Calls",
                    position: "insideBottom",
                    offset: -12,
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={112}
                  tickLine={false}
                  axisLine={false}
                  className="text-xs text-muted-foreground"
                  label={{
                    value: "Status",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="count" name="Calls" barSize={18}>
                  {statusData.map((item) => (
                    <Cell
                      key={item.status}
                      fill={statusColors[item.status] ?? "var(--color-count)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {statusData.map((item) => (
                <Link
                  key={item.status}
                  href={dashboardCallsHref({ range, status: item.status })}
                  className="group flex items-center justify-between gap-3 border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/35 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`Review ${labelStatus(item.status)} calls in the selected dashboard range`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2 shrink-0"
                        style={{
                          background:
                            statusColors[item.status] ?? "var(--color-count)",
                        }}
                      />
                      <span className="truncate capitalize text-foreground">
                        {labelStatus(item.status)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {item.count} calls,{" "}
                      {statusPattern[item.status] ?? "solid bar"}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                    Review
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="sr-only">
              <table aria-describedby={statusSummaryId}>
                <caption>Call outcome status breakdown data table</caption>
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Calls</th>
                    <th scope="col">Percentage of calls</th>
                    <th scope="col">Legend pattern</th>
                  </tr>
                </thead>
                <tbody>
                  {statusChartData.map((item) => (
                    <tr key={item.status}>
                      <th scope="row">{item.label}</th>
                      <td>{item.count}</td>
                      <td>{item.percentage}%</td>
                      <td>{item.pattern}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={PhoneCall}
            title="No outcomes yet"
            description="Place a test call to confirm completion, failed, and missed call states are flowing into reporting."
            className="h-64 bg-background/40"
            action={
              <Button asChild size="sm">
                <Link href="/outbound">Place a test call</Link>
              </Button>
            }
          />
        )}
      </div>
      <div className="border bg-card p-5" aria-labelledby={directionTitleId}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Routing
            </p>
            <h3
              id={directionTitleId}
              className="mt-1 text-base font-semibold text-foreground"
            >
              Direction mix
            </h3>
            <p id={directionSummaryId} className="text-xs text-muted-foreground">
              Inbound and outbound call composition by count and share of
              routed calls.
            </p>
          </div>
          <div className="border bg-background px-3 py-2 text-right">
            <p className="text-sm font-semibold text-foreground">{inboundPct}%</p>
            <p className="text-xs text-muted-foreground">inbound</p>
          </div>
        </div>
        {directionData.length ? (
          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <ChartContainer
              config={directionConfig}
              className="h-64 w-full"
              role="group"
              aria-label="Inbound and outbound direction mix chart"
            >
              <PieChart
                accessibilityLayer
                aria-label="Inbound and outbound direction mix chart"
                aria-describedby={directionSummaryId}
              >
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={directionChartData}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={54}
                  outerRadius={92}
                  paddingAngle={2}
                >
                  {directionData.map((item) => (
                    <Cell
                      key={item.direction}
                      fill={directionColors[item.direction]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-col justify-center gap-3">
              {directionChartData.map((item) => (
                <div key={item.direction} className="border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="capitalize text-muted-foreground">
                      {item.direction}
                    </span>
                    <span className="font-semibold text-foreground">{item.count}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.percentage}% of routed calls, {item.pattern}
                  </p>
                  <div className="mt-2 h-1.5 bg-muted">
                    <div
                      className="h-full"
                      style={{
                        width: `${
                          directionTotal
                            ? Math.round((item.count / directionTotal) * 100)
                            : 0
                        }%`,
                        background:
                          directionColors[item.direction] ?? "var(--muted-foreground)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="sr-only">
              <table aria-describedby={directionSummaryId}>
                <caption>Inbound and outbound direction mix data table</caption>
                <thead>
                  <tr>
                    <th scope="col">Direction</th>
                    <th scope="col">Calls</th>
                    <th scope="col">Percentage of routed calls</th>
                    <th scope="col">Legend pattern</th>
                  </tr>
                </thead>
                <tbody>
                  {directionChartData.map((item) => (
                    <tr key={item.direction}>
                      <th scope="row">{item.label}</th>
                      <td>{item.count}</td>
                      <td>{item.percentage}%</td>
                      <td>{item.pattern}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={ArrowRight}
            title="No routing data yet"
            description="Connect a number or place a test call to see inbound and outbound routing mix."
            className="h-64 bg-background/40"
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild size="sm">
                  <Link href="/numbers">Connect a number</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/outbound">Place a test call</Link>
                </Button>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
