"use client";

import { useMemo, useState } from "react";
import {
  Download,
  Loader2,
  MoreHorizontal,
  PhoneCall,
  PhoneOutgoing,
  RefreshCw,
  RotateCcw,
  Search,
  SquareX,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/src/components/common/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useAgents } from "@/src/hooks/queries/agents";
import {
  useCancelOutboundCall,
  useOutboundCall,
  useOutboundCalls,
  useRetryOutboundCall,
} from "@/src/hooks/queries/outbound";
import type { OutboundCall } from "@/src/lib/api/resources/outbound";
import type { CallStatus } from "@/src/lib/api/types";
import { downloadRowsAsCsv } from "@/src/lib/export-csv";

const STATUS_OPTIONS: Array<"all" | CallStatus> = [
  "all",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "NOT_ANSWERED",
  "PROCESSED",
];

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDuration(seconds: number | null | undefined) {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function statusVariant(status: CallStatus) {
  if (status === "FAILED" || status === "NOT_ANSWERED") return "destructive" as const;
  if (status === "COMPLETED") return "default" as const;
  if (status === "IN_PROGRESS") return "secondary" as const;
  return "outline" as const;
}

function canCancel(call: OutboundCall) {
  return call.status === "SCHEDULED";
}

function canRetry(call: OutboundCall) {
  return call.status === "FAILED" || call.status === "NOT_ANSWERED";
}

function downloadOutboundCsv(calls: OutboundCall[], agentName: (id: string | null) => string) {
  downloadRowsAsCsv("quickvoice-outbound-calls.csv", calls, [
    { header: "Outbound ID", value: (call) => call.outboundId },
    { header: "Status", value: (call) => call.status },
    { header: "Mode", value: (call) => call.mode },
    { header: "Agent", value: (call) => agentName(call.agentId) },
    { header: "To number", value: (call) => call.phoneNumber },
    { header: "From number", value: (call) => call.fromNumber },
    { header: "Scheduled at", value: (call) => call.scheduledAt ?? "" },
    { header: "Created at", value: (call) => call.createdAt },
    {
      header: "Failure reason",
      value: (call) => call.failureReason ?? call.cancellationReason ?? "",
    },
  ]);
}

function OutboundCallDetailDialog({
  call,
  onOpenChange,
}: {
  call: OutboundCall | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: detail, isLoading } = useOutboundCall(call?.outboundId);
  const shown = detail ?? call;

  return (
    <Dialog open={!!call} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Outbound call</DialogTitle>
          <DialogDescription>
            Call destination, dispatch status, and prompt overrides.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !shown ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge className="mt-2 capitalize" variant={statusVariant(shown.status)}>
                  {statusLabel(shown.status)}
                </Badge>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Mode</p>
                <p className="mt-1 font-medium capitalize">{shown.mode}</p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="mt-1 font-medium tabular-nums">
                  {fmtDuration(shown.callLog?.durationSeconds)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">To</p>
                <p className="mt-1 font-mono text-xs">{shown.phoneNumber}</p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">From</p>
                <p className="mt-1 font-mono text-xs">{shown.fromNumber}</p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="mt-1 font-medium">{fmtDate(shown.scheduledAt)}</p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Updated</p>
                <p className="mt-1 font-medium">{fmtDate(shown.updatedAt)}</p>
              </div>
            </div>

            {shown.failureReason || shown.cancellationReason ? (
              <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {shown.failureReason ?? shown.cancellationReason}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">First message</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {shown.firstMessage || "-"}
                </p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">System prompt override</p>
                <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-sm">
                  {shown.systemPrompt || "-"}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function OutboundCallsPanel() {
  const { data: agents = [] } = useAgents();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CallStatus>("all");
  const [mode, setMode] = useState<"all" | "quick" | "campaign">("all");
  const [selectedCall, setSelectedCall] = useState<OutboundCall | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OutboundCall | null>(null);
  const retryCall = useRetryOutboundCall();
  const cancelCall = useCancelOutboundCall();

  const params = useMemo(
    () => ({
      limit: 100,
      ...(status !== "all" ? { status } : {}),
      ...(mode !== "all" ? { mode } : {}),
    }),
    [mode, status]
  );
  const { data, isLoading, isError, isFetching, refetch } = useOutboundCalls(params);
  const calls = useMemo(() => data?.items ?? [], [data?.items]);

  const agentNames = useMemo(
    () => new Map(agents.map((agent) => [agent.agentId, agent.name])),
    [agents]
  );

  const filteredCalls = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return calls;
    return calls.filter((call) =>
      [
        call.outboundId,
        call.phoneNumber,
        call.fromNumber,
        call.status,
        call.mode,
        agentNames.get(call.agentId ?? "") ?? "-",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [agentNames, calls, search]);

  async function confirmCancel() {
    try {
      if (!cancelTarget) return;
      await cancelCall.mutateAsync(cancelTarget.outboundId, {
        onSuccess: () => setCancelTarget(null),
      });
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={PhoneOutgoing}
        title="Could not load outbound calls"
        description="Refresh outbound calls or try again after checking your connection."
        action={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 border bg-card p-4 xl:grid-cols-[minmax(0,1fr)_180px_160px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search calls, numbers, agents, or status"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((item) => (
              <SelectItem key={item} value={item} className="capitalize">
                {item === "all" ? "All statuses" : statusLabel(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="quick">Quick</SelectItem>
            <SelectItem value="campaign">Campaign</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            downloadOutboundCsv(filteredCalls, (id) => agentNames.get(id ?? "") ?? "-");
            toast.success("Outbound export downloaded");
          }}
          disabled={!filteredCalls.length}
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {!filteredCalls.length ? (
        <EmptyState
          icon={PhoneOutgoing}
          title="No outbound calls found"
          description="Start a quick call, create a batch campaign, or adjust the current filters."
        />
      ) : (
        <div className="border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Call</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCalls.map((call) => (
                <TableRow key={call.outboundId}>
                  <TableCell>
                    <div className="min-w-64 space-y-1">
                      <div className="flex items-center gap-2">
                        <PhoneCall className="size-4 text-muted-foreground" />
                        <p className="font-mono text-xs">{call.phoneNumber}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        From {call.fromNumber} · {call.mode}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="capitalize" variant={statusVariant(call.status)}>
                      {statusLabel(call.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{agentNames.get(call.agentId ?? "") ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(call.scheduledAt)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {fmtDuration(call.callLog?.durationSeconds)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for outbound call ${call.outboundId}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Call actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setSelectedCall(call)}>
                          <PhoneCall className="size-4" />
                          View details
                        </DropdownMenuItem>
                        {canRetry(call) ? (
                          <DropdownMenuItem
                            onClick={() => retryCall.mutate(call.outboundId)}
                            disabled={retryCall.isPending}
                          >
                            <RotateCcw className="size-4" />
                            Retry call
                          </DropdownMenuItem>
                        ) : null}
                        {canCancel(call) ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setCancelTarget(call)}
                            >
                              <SquareX className="size-4" />
                              Cancel call
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OutboundCallDetailDialog
        call={selectedCall}
        onOpenChange={(open) => {
          if (!open) setSelectedCall(null);
        }}
      />

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open && !cancelCall.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel outbound call?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels the scheduled call to {cancelTarget?.phoneNumber}.
              Calls already in progress cannot be cancelled here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelCall.isPending}>
              Keep call
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                confirmCancel();
              }}
              disabled={cancelCall.isPending}
            >
              {cancelCall.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Cancel call
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
