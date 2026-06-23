"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  ErrorState,
  OfflineState,
  PermissionState,
} from "@/src/components/common/EmptyState";
import { PageHeader } from "@/src/components/common/PageHeader";
import { RetryButton } from "@/src/components/common/RetryButton";
import { RangeSwitcher } from "@/src/components/dashboard/RangeSwitcher";
import { KpiCards } from "@/src/components/dashboard/KpiCards";
import { VolumeChart } from "@/src/components/dashboard/VolumeChart";
import { BreakdownCharts } from "@/src/components/dashboard/BreakdownCharts";
import { RecentCallsTable } from "@/src/components/dashboard/RecentCallsTable";
import { AgentActivityList } from "@/src/components/dashboard/AgentActivityList";
import { DashboardFreshness } from "@/src/components/dashboard/DashboardFreshness";
import { useDashboardSummary } from "@/src/hooks/queries/dashboard";
import type {
  DashboardRange,
  DashboardSummary,
} from "@/src/lib/api/resources/dashboard";
import {
  apiErrorStatus,
  getApiErrorStateCopy,
} from "@/src/lib/api-error-state";

const MISSING_SECTION_FORMAT = new Intl.ListFormat("en-US", {
  style: "long",
  type: "conjunction",
});

function resolveRange(param: string | null): DashboardRange {
  if (param === "24h" || param === "7d" || param === "30d") return param;
  return "7d";
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    function syncOnlineState() {
      setIsOnline(navigator.onLine);
    }

    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);

    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  return isOnline;
}

function collectionSize(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function isPermissionError(error: unknown) {
  const status = apiErrorStatus(error);
  return status === 401 || status === 403;
}

function getMissingDashboardSections(summary?: DashboardSummary) {
  if (!summary || (summary.totals?.calls ?? 0) === 0) return [];

  const missingSections: string[] = [];
  if (collectionSize(summary.series) === 0) missingSections.push("traffic timeline");
  if (collectionSize(summary.statusBreakdown) === 0) {
    missingSections.push("outcome breakdown");
  }
  if (collectionSize(summary.directionBreakdown) === 0) {
    missingSections.push("routing mix");
  }
  if (collectionSize(summary.topAgents) === 0) missingSections.push("agent activity");
  if (collectionSize(summary.recent) === 0) missingSections.push("recent calls");
  return missingSections;
}

function DashboardPartialDataNotice({ sections }: { sections: string[] }) {
  if (!sections.length) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Partial dashboard data</p>
          <p className="mt-1">
            The summary loaded, but {MISSING_SECTION_FORMAT.format(sections)}{" "}
            {sections.length === 1 ? "is" : "are"} not available yet. Refresh or
            review call logs while the remaining data catches up.
          </p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0 bg-card">
        <Link href="/calls">Review call logs</Link>
      </Button>
    </div>
  );
}

export default function DashboardPage() {
  const params = useSearchParams();
  const range = resolveRange(params.get("range"));
  const isOnline = useOnlineStatus();
  const {
    data,
    dataUpdatedAt,
    error,
    isLoading,
    isError,
    isFetching,
    isStale,
    refetch,
  } = useDashboardSummary(range);
  const successPct = Math.round((data?.totals.successRate ?? 0) * 100);
  const exceptionCalls =
    (data?.totals.failedCalls ?? 0) + (data?.totals.missedCalls ?? 0);
  const showBlockingError = isError && !data;
  const dashboardHasPermissionError =
    showBlockingError && isPermissionError(error);
  const dashboardErrorState = showBlockingError
    ? getApiErrorStateCopy(error, {
        resourceName: "dashboard",
        isOnline,
        overrides: {
          forbidden: {
            title: "Dashboard access required",
            description:
              "You need dashboard and call reporting permission to view this operations summary. Ask a workspace owner to update your role.",
          },
        },
      })
    : null;
  const missingDashboardSections = getMissingDashboardSections(data);
  const dashboardRetryAction = (
    <RetryButton
      onClick={() => refetch()}
      isRetrying={isFetching}
      disabled={
        dashboardErrorState?.kind === "offline" && !isOnline
      }
    >
      Retry
    </RetryButton>
  );
  const dashboardErrorAction =
    dashboardErrorState?.reason === "forbidden" ? (
      <Button asChild variant="outline">
        <Link href="/settings/roles">Review role settings</Link>
      </Button>
    ) : dashboardErrorState?.reason === "unauthorized" ? (
      <Button asChild variant="outline">
        <Link href="/login">Sign in</Link>
      </Button>
    ) : (
      dashboardRetryAction
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="A compact view of call volume, outcomes, routing, and agent performance."
        actions={<RangeSwitcher current={range} loading={isFetching} />}
      />
      <DashboardFreshness
        summary={data}
        loading={isLoading}
        dataUpdatedAt={dataUpdatedAt}
        isFetching={isFetching}
        isStale={isStale}
        onRefresh={() => refetch()}
      />
      {dashboardErrorState?.kind === "offline" ? (
        <OfflineState
          title={dashboardErrorState.title}
          description={dashboardErrorState.description}
          action={dashboardErrorAction}
        />
      ) : dashboardErrorState?.kind === "permission" ||
        dashboardHasPermissionError ? (
        <PermissionState
          title={dashboardErrorState?.title}
          description={dashboardErrorState?.description}
          action={dashboardErrorAction}
        />
      ) : dashboardErrorState ? (
        <ErrorState
          title={dashboardErrorState.title}
          description={dashboardErrorState.description}
          action={dashboardErrorAction}
        />
      ) : (
        <>
          <DashboardPartialDataNotice sections={missingDashboardSections} />
          <div className="grid gap-4 border bg-card p-5 lg:grid-cols-[1fr_340px] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Operations snapshot
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                {isLoading
                  ? "Loading call performance"
                  : `${data?.totals.calls ?? 0} calls at ${successPct}% success`}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Monitor traffic shape, service quality, and agent load from one
                place.
              </p>
            </div>
            <div className="grid grid-cols-3 border bg-background text-center text-xs">
              <div className="border-r px-3 py-3">
                <p className="text-lg font-semibold text-foreground">
                  {data?.totals.minutes ?? 0}
                </p>
                <p className="text-muted-foreground">minutes</p>
              </div>
              <div className="border-r px-3 py-3">
                <p className="text-lg font-semibold text-foreground">
                  {exceptionCalls}
                </p>
                <p className="text-muted-foreground">exceptions</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-lg font-semibold text-foreground">
                  {data?.topAgents.length ?? 0}
                </p>
                <p className="text-muted-foreground">agents</p>
              </div>
            </div>
          </div>
          <KpiCards summary={data} range={range} loading={isLoading} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <VolumeChart summary={data} range={range} loading={isLoading} />
            </div>
            <AgentActivityList
              summary={data}
              range={range}
              loading={isLoading}
            />
          </div>
          <BreakdownCharts summary={data} range={range} loading={isLoading} />
          <RecentCallsTable summary={data} loading={isLoading} />
        </>
      )}
    </div>
  );
}
