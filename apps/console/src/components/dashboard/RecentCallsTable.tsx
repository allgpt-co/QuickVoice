"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, PhoneCall } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { EmptyState } from "@/src/components/common/EmptyState";
import type { DashboardSummary } from "@/src/lib/api/resources/dashboard";
import { useAgents } from "@/src/hooks/queries/agents";
import type { Agent, CallLog, CallStatus } from "@/src/lib/api/types";

const linkFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function statusVariant(
  status: CallStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "FAILED":
    case "NOT_ANSWERED":
      return "destructive";
    case "IN_PROGRESS":
    case "SCHEDULED":
    case "PROCESSED":
      return "secondary";
    default:
      return "outline";
  }
}

function statusClass(status: CallStatus) {
  switch (status) {
    case "COMPLETED":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "FAILED":
    case "NOT_ANSWERED":
      return "border-destructive/25 bg-destructive/10 text-destructive";
    case "IN_PROGRESS":
      return "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function formatAbsoluteTimestamp(iso: string | null) {
  if (!iso) return "No start timestamp";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Unknown";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function formatStatus(status: string) {
  return status.toLowerCase().replace("_", " ");
}

function metadataText(call: CallLog, key: "fromNumber" | "toNumber") {
  const value = call.metadata?.[key];
  return typeof value === "string" && value.trim().length ? value : null;
}

function callParties(call: CallLog) {
  const fromNumber = metadataText(call, "fromNumber");
  const toNumber = metadataText(call, "toNumber");

  if (call.direction === "inbound") {
    return {
      caller: fromNumber ?? call.callerId ?? "Unknown caller",
      callee: toNumber ?? "Unknown callee",
    };
  }

  if (call.direction === "outbound") {
    return {
      caller: fromNumber ?? "Unknown caller",
      callee: toNumber ?? call.callerId ?? "Unknown callee",
    };
  }

  return {
    caller: fromNumber ?? call.callerId ?? "Unknown caller",
    callee: toNumber ?? "Unknown callee",
  };
}

function shortId(id: string) {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function resolveAgentLabel({
  call,
  agents,
  agentsLoading,
  agentsError,
}: {
  call: CallLog;
  agents?: Agent[];
  agentsLoading: boolean;
  agentsError: boolean;
}) {
  if (!call.agentId) return "Unassigned";
  if (agentsLoading) return "Resolving agent";
  if (agentsError) return "Agent name unavailable";
  return agents?.find((agent) => agent.agentId === call.agentId)?.name ?? "Unknown agent";
}

function CallTimestamp({ call }: { call: CallLog }) {
  return call.startTime ? (
    <time dateTime={call.startTime}>{formatAbsoluteTimestamp(call.startTime)}</time>
  ) : (
    <span>No start timestamp</span>
  );
}

export function RecentCallsTable({
  summary,
  loading,
}: {
  summary?: DashboardSummary;
  loading?: boolean;
}) {
  const {
    data: agents,
    isLoading: agentsLoading,
    isError: agentsError,
  } = useAgents();
  const hasAgentLookupGap =
    agentsError && Boolean(summary?.recent.some((call) => call.agentId));

  return (
    <div className="border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent activity
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            Recent call logs
          </h3>
          <p className="text-xs text-muted-foreground">
            Latest call log activity across all agents.
          </p>
        </div>
        <Link
          href="/calls"
          className={`inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline ${linkFocusClass}`}
        >
          View call logs <ArrowRight className="size-3" />
        </Link>
      </div>
      {hasAgentLookupGap ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-xs text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Partial call log data:</span>{" "}
            recent call logs loaded, but agent names could not be resolved. Open
            a call detail for the full source record.
          </span>
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-2 p-5">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !summary?.recent.length ? (
        <EmptyState
          icon={PhoneCall}
          title="No call logs yet"
          description="Start with a test call or connect a number so recent call log activity has source records to show."
          className="border-0"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild size="sm">
                <Link href="/outbound">Start with a test call</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/numbers">Connect number</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="divide-y md:divide-y-0">
          <ul className="divide-y md:hidden">
            {summary.recent.map((call) => {
              const parties = callParties(call);
              const agentLabel = resolveAgentLabel({
                call,
                agents,
                agentsLoading,
                agentsError,
              });

              return (
                <li key={call.callId}>
                  <Link
                    href={`/calls/${call.callId}`}
                    aria-label={`Open call ${call.callId}: ${parties.caller} to ${parties.callee}`}
                    className={`group block px-5 py-4 transition-colors hover:bg-muted/40 ${linkFocusClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">
                          <CallTimestamp call={call} />
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground">
                          {parties.caller}
                        </p>
                      </div>
                      <Badge
                        variant={statusVariant(call.status)}
                        className={`w-fit shrink-0 capitalize ${statusClass(call.status)}`}
                      >
                        {formatStatus(call.status)}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Callee</dt>
                        <dd className="truncate font-medium text-foreground">
                          {parties.callee}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Agent</dt>
                        <dd className="truncate font-medium text-foreground">
                          {agentLabel}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Duration</dt>
                        <dd className="font-medium text-foreground">
                          {formatDuration(call.durationSeconds)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Direction</dt>
                        <dd className="font-medium capitalize text-foreground">
                          {call.direction ?? "unknown"}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block">
            <Table className="min-w-[920px]">
              <TableCaption className="sr-only">
                Recent call logs with absolute timestamps, caller, callee,
                assigned agent, duration, and status.
              </TableCaption>
              <TableHeader>
                <TableRow className="border-b bg-muted/20 hover:bg-muted/20">
                  <TableHead className="pl-5">Started</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Callee</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.recent.map((call) => {
                  const parties = callParties(call);
                  const agentLabel = resolveAgentLabel({
                    call,
                    agents,
                    agentsLoading,
                    agentsError,
                  });

                  return (
                    <TableRow key={call.callId} className="hover:bg-muted/30">
                      <TableCell className="pl-5 align-top text-sm text-muted-foreground">
                        <CallTimestamp call={call} />
                        <p className="mt-1 text-xs capitalize">
                          {call.direction ?? "unknown"}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[180px] whitespace-normal align-top">
                        <p className="truncate text-sm font-medium text-foreground">
                          {parties.caller}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Caller</p>
                      </TableCell>
                      <TableCell className="max-w-[180px] whitespace-normal align-top">
                        <p className="truncate text-sm font-medium text-foreground">
                          {parties.callee}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Callee</p>
                      </TableCell>
                      <TableCell className="max-w-[180px] whitespace-normal align-top">
                        <p className="truncate text-sm font-medium text-foreground">
                          {agentLabel}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {call.agentId ? `ID ${shortId(call.agentId)}` : "No agent assigned"}
                        </p>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {formatDuration(call.durationSeconds)}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant={statusVariant(call.status)}
                          className={`w-fit shrink-0 capitalize ${statusClass(call.status)}`}
                        >
                          {formatStatus(call.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-right align-top">
                        <Link
                          href={`/calls/${call.callId}`}
                          aria-label={`Open call ${call.callId}: ${parties.caller} to ${parties.callee}`}
                          className={`group inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline ${linkFocusClass}`}
                        >
                          Open
                          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
