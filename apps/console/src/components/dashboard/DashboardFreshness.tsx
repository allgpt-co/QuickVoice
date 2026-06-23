"use client";

import { useEffect, useState } from "react";
import { Clock3, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import type { DashboardSummary } from "@/src/lib/api/resources/dashboard";

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
};

function formatDateTime(value?: string | number) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", DATE_TIME_FORMAT);
}

export function DashboardFreshness({
  summary,
  loading,
  dataUpdatedAt,
  isFetching,
  isStale,
  onRefresh,
}: {
  summary?: DashboardSummary;
  loading?: boolean;
  dataUpdatedAt: number;
  isFetching: boolean;
  isStale: boolean;
  onRefresh: () => void;
}) {
  const [isOnline, setIsOnline] = useState(true);
  const hasData = Boolean(summary);
  const showStale = hasData && isStale && !isFetching;

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

  return (
    <section
      aria-busy={isFetching}
      aria-live="polite"
      className="border bg-card p-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reporting window
            </p>
            <p className="mt-1 text-foreground">
              {loading || !summary
                ? "Loading selected period"
                : `${formatDateTime(summary.period.from)} to ${formatDateTime(
                    summary.period.to
                  )}`}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Last updated
            </p>
            <p className="mt-1 inline-flex items-center gap-2 text-foreground">
              <Clock3 className="size-4 text-muted-foreground" />
              {dataUpdatedAt ? formatDateTime(dataUpdatedAt) : "Not updated yet"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={isFetching || !isOnline}
          aria-label="Refresh dashboard"
          className="w-full sm:w-fit"
        >
          <RefreshCw className={isFetching ? "animate-spin" : undefined} />
          {isFetching ? "Refreshing" : "Refresh dashboard"}
        </Button>
      </div>
      {!isOnline ? (
        <div className="mt-3 flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
          <WifiOff className="mt-0.5 size-3.5 shrink-0" />
          <span>
            You are offline.{" "}
            {hasData
              ? "Showing the last loaded dashboard data until your connection returns."
              : "Reconnect to load dashboard data."}
          </span>
        </div>
      ) : showStale ? (
        <div className="mt-3 border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Dashboard data is stale. Refresh to confirm the latest call activity.
        </div>
      ) : null}
    </section>
  );
}
