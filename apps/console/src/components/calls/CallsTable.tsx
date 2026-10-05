"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  MoreHorizontal,
  PhoneIncoming,
  PhoneOutgoing,
  FileText,
  Info,
  Trash2,
  Columns3,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { PhoneCall } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
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
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import { CallTranscriptSheet } from "@/src/components/calls/CallTranscriptSheet";
import { CallMetadataSheet } from "@/src/components/calls/CallMetadataSheet";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAgents } from "@/src/hooks/queries/agents";
import { useCalls, useDeleteCall } from "@/src/hooks/queries/calls";
import type { CallListParams } from "@/src/lib/api/resources/calls";
import type { CallLog, CallStatus } from "@/src/lib/api/types";
import { downloadRowsAsCsv } from "@/src/lib/export-csv";

// ── formatters ────────────────────────────────────────────────────────────────

function fmtStartTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDuration(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CallStatus }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center rounded-sm border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
        COMPLETED
      </span>
    );
  }
  if (status === "FAILED" || status === "NOT_ANSWERED") {
    return (
      <Badge variant="destructive" className="text-[10px] uppercase">
        {status.replace("_", " ")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] uppercase">
      {status.replace("_", " ")}
    </Badge>
  );
}

function DirectionCell({ direction }: { direction: string | null }) {
  if (direction === "outbound") {
    return (
      <div className="flex items-center gap-2">
        <PhoneOutgoing className="size-4 text-sky-400" />
        <span className="rounded-sm border border-sky-500/30 bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-400">
          Outbound
        </span>
      </div>
    );
  }
  if (direction === "inbound") {
    return (
      <div className="flex items-center gap-2">
        <PhoneIncoming className="size-4 text-emerald-400" />
        <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
          Inbound
        </span>
      </div>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

// ── column definitions ────────────────────────────────────────────────────────

const COLUMNS = [
  { key: "startTime", label: "Start Time" },
  { key: "number",    label: "Number" },
  { key: "agent",     label: "Agent" },
  { key: "duration",  label: "Duration" },
  { key: "direction", label: "Direction" },
  { key: "status",    label: "Status" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

// ── main component ────────────────────────────────────────────────────────────

export function CallsTable({
  filters,
}: {
  filters: Omit<CallListParams, "cursor" | "limit">;
}) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const { data: agents } = useAgents();
  const del = useDeleteCall();

  // Seed pageIdx from URL ?page= (1-based → 0-based)
  const urlPage = Math.max(1, Number(searchParams.get("page") ?? 1));
  const [pageIdx, setPageIdx] = useState(urlPage - 1);
  const [pageSize, setPageSize] = useState(20);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    new Set(COLUMNS.map((c) => c.key))
  );
  const [transcriptCall, setTranscriptCall] = useState<CallLog | null>(null);
  const [metadataCall, setMetadataCall]     = useState<CallLog | null>(null);
  const [deleteTarget, setDeleteTarget]     = useState<CallLog | null>(null);

  const query = useCalls(filters, pageSize);

  // Reflect pageIdx in URL without adding browser-history entries
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (pageIdx === 0) {
      params.delete("page");
    } else {
      params.set("page", String(pageIdx + 1));
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pageIdx]); // eslint-disable-line

  // Reset to first page when filters or page size change
  useEffect(() => { setPageIdx(0); }, [JSON.stringify(filters), pageSize]); // eslint-disable-line

  // Auto-fetch intermediate pages when landing on a deep URL (e.g. ?page=3)
  useEffect(() => {
    if (pageIdx >= (query.data?.pages.length ?? 0) && query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [pageIdx, query.data?.pages.length, query.hasNextPage, query.isFetchingNextPage]); // eslint-disable-line

  const pages      = query.data?.pages ?? [];
  const calls: CallLog[] = pages[pageIdx]?.data ?? [];
  const totalFetchedPages = pages.length;
  const hasNextRemote     = query.hasNextPage;
  const isLastFetched     = pageIdx === totalFetchedPages - 1;
  const hasNext           = !isLastFetched || hasNextRemote;
  const hasPrev           = pageIdx > 0;
  const displayPage       = pageIdx + 1; // 1-based for display

  const agentName = (id: string | null) =>
    agents?.find((a) => a.agentId === id)?.name ?? "—";

  function exportCalls() {
    downloadRowsAsCsv("quickvoice-call-history.csv", calls, [
      { header: "Start time", value: (call) => call.startTime ?? "" },
      { header: "Number", value: (call) => call.callerId ?? "" },
      { header: "Agent", value: (call) => agentName(call.agentId) },
      { header: "Duration seconds", value: (call) => call.durationSeconds ?? "" },
      { header: "Direction", value: (call) => call.direction ?? "" },
      { header: "Status", value: (call) => call.status },
      { header: "Call ID", value: (call) => call.callId },
    ]);
  }

  const toggleCol = (key: ColKey) =>
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  async function goNext() {
    if (!isLastFetched) {
      setPageIdx((i) => i + 1);
    } else if (hasNextRemote) {
      await query.fetchNextPage();
      setPageIdx((i) => i + 1);
    }
  }
  function goPrev() {
    setPageIdx((i) => Math.max(0, i - 1));
  }

  async function confirmDelete() {
    try {
      if (!deleteTarget) return;
      await del.mutateAsync(deleteTarget.callId);
      setDeleteTarget(null);
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        icon={PhoneCall}
        title="Could not load calls"
        description="Refresh the call list or try again after checking your connection."
        action={
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <Loader2 className={query.isFetching ? "animate-spin" : undefined} />
            Retry
          </Button>
        }
      />
    );
  }

  if (!calls.length && pageIdx === 0) {
    return (
      <EmptyState
        icon={PhoneCall}
        title="No calls match these filters"
        description="Try a wider date range or remove a filter."
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* ── toolbar ── */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportCalls}
            disabled={calls.length === 0}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Columns3 className="size-4" />
                Columns {visibleCols.size} / {COLUMNS.length}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Toggle columns
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={visibleCols.has(col.key)}
                  onCheckedChange={() => toggleCol(col.key)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-3 md:hidden">
          {calls.map((c) => (
            <div
              key={c.callId}
              className="border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.callerId ?? "Unknown number"}</p>
                  <p className="text-xs text-muted-foreground">{fmtStartTime(c.startTime)}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p className="truncate">{agentName(c.agentId)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p>{fmtDuration(c.durationSeconds)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Direction</p>
                  <div className="mt-1"><DirectionCell direction={c.direction} /></div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setTranscriptCall(c)}>
                  <FileText className="size-4" /> Transcript
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMetadataCall(c)}>
                  <Info className="size-4" /> Metadata
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(c)}
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* ── table ── */}
        <div className="hidden overflow-x-auto border bg-card md:block">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="border-b bg-muted/20 hover:bg-muted/20">
                {visibleCols.has("startTime") && <TableHead className="pl-4 whitespace-nowrap">Start Time</TableHead>}
                {visibleCols.has("number")    && <TableHead className="whitespace-nowrap">Number</TableHead>}
                {visibleCols.has("agent")     && <TableHead className="whitespace-nowrap">Agent</TableHead>}
                {visibleCols.has("duration")  && <TableHead className="whitespace-nowrap">Duration</TableHead>}
                {visibleCols.has("direction") && <TableHead className="whitespace-nowrap">Direction</TableHead>}
                {visibleCols.has("status")    && <TableHead className="whitespace-nowrap">Status</TableHead>}
                <TableHead className="w-16 pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((c) => (
                <TableRow
                  key={c.callId}
                  className="border-b transition-colors hover:bg-muted/10"
                >
                  {visibleCols.has("startTime") && (
                    <TableCell className="pl-4 text-sm text-muted-foreground">{fmtStartTime(c.startTime)}</TableCell>
                  )}
                  {visibleCols.has("number") && (
                    <TableCell className="font-medium">{c.callerId ?? "—"}</TableCell>
                  )}
                  {visibleCols.has("agent") && (
                    <TableCell className="text-sm text-muted-foreground">{agentName(c.agentId)}</TableCell>
                  )}
                  {visibleCols.has("duration") && (
                    <TableCell className="text-sm">{fmtDuration(c.durationSeconds)}</TableCell>
                  )}
                  {visibleCols.has("direction") && (
                    <TableCell><DirectionCell direction={c.direction} /></TableCell>
                  )}
                  {visibleCols.has("status") && (
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  )}
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setTranscriptCall(c)}>
                          <FileText className="size-4" /> Show transcript
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMetadataCall(c)}>
                          <Info className="size-4" /> Show metadata
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(c)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── pagination bar ── */}
        {(() => {
          const allFetched     = !query.hasNextPage;
          const totalKnownPages = totalFetchedPages;

          return (
            <div className="flex flex-col gap-3 px-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end">
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                {/* rows per page */}
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap font-medium text-foreground">Rows per page</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3">
                        {pageSize}
                        <ChevronRight className="size-3 rotate-90 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-24">
                      <DropdownMenuRadioGroup
                        value={String(pageSize)}
                        onValueChange={(v) => setPageSize(Number(v))}
                      >
                        {[10, 20, 50].map((n) => (
                          <DropdownMenuRadioItem key={n} value={String(n)}>
                            {n}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* page indicator */}
                <span className="whitespace-nowrap font-medium text-foreground">
                  Page {displayPage}{allFetched ? ` of ${totalKnownPages}` : ""}
                </span>

                {/* nav buttons */}
                <div className="flex items-center gap-0.5">
                  <Button variant="outline" size="icon" className="size-8"
                    onClick={() => setPageIdx(0)}
                    disabled={!hasPrev || query.isFetchingNextPage}
                    aria-label="First page"
                  >
                    <ChevronsLeft className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="size-8"
                    onClick={goPrev}
                    disabled={!hasPrev || query.isFetchingNextPage}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="size-8"
                    onClick={goNext}
                    disabled={!hasNext || query.isFetchingNextPage}
                    aria-label="Next page"
                  >
                    {query.isFetchingNextPage
                      ? <Loader2 className="size-4 animate-spin" />
                      : <ChevronRight className="size-4" />}
                  </Button>
                  <Button variant="outline" size="icon" className="size-8"
                    onClick={() => setPageIdx(totalKnownPages - 1)}
                    disabled={!allFetched || pageIdx >= totalKnownPages - 1 || query.isFetchingNextPage}
                    aria-label="Last page"
                  >
                    <ChevronsRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <CallTranscriptSheet call={transcriptCall} onClose={() => setTranscriptCall(null)} />
      <CallMetadataSheet   call={metadataCall}   onClose={() => setMetadataCall(null)} />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this call?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting a call removes its metadata and transcripts. Audio
              recordings in object storage are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? <><Loader2 className="animate-spin" /> Deleting…</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
