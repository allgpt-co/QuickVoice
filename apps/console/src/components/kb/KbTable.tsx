"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  FALLBACK_META,
  KnowledgeSourceStatus,
  SOURCE_META,
} from "@/src/components/kb/kb-utils";
import { EditKbDialog } from "@/src/components/kb/EditKbDialog";
import { useDeleteKb, useRetryKb } from "@/src/hooks/queries/kb";
import type { Agent, KnowledgeSource } from "@/src/lib/api/types";

const PAGE_SIZE = 10;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function metadataRecord(source: KnowledgeSource) {
  return source.metadata ?? {};
}

function failureReason(source: KnowledgeSource) {
  const value = metadataRecord(source).failureReason;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function jobLabel(source: KnowledgeSource) {
  const value = metadataRecord(source).jobId;
  if (typeof value !== "string" || value.length === 0) return null;
  return {
    full: value,
    short: value.length > 16 ? `${value.slice(0, 16)}…` : value,
  };
}

function processingLabel(source: KnowledgeSource) {
  if (source.status !== "PROCESSING") return null;
  const metadata = metadataRecord(source);
  const rawStage =
    typeof metadata.stage === "string" ? metadata.stage : "processing";
  const stage = rawStage.replaceAll("_", " ");
  const progress =
    metadata.progress &&
    typeof metadata.progress === "object" &&
    !Array.isArray(metadata.progress)
      ? (metadata.progress as Record<string, unknown>)
      : null;
  const percent =
    typeof progress?.percent === "number"
      ? Math.max(0, Math.min(100, Math.round(progress.percent)))
      : null;
  return percent === null ? stage : `${stage} · ${percent}%`;
}

function canRetry(source: KnowledgeSource) {
  return (
    source.status === "ERROR" && metadataRecord(source).retryable !== false
  );
}

function RowActions({
  source,
  onEdit,
}: {
  source: KnowledgeSource;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const del = useDeleteKb();
  const retry = useRetryKb();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Row actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4" /> View / edit
          </DropdownMenuItem>
          {canRetry(source) ? (
            <DropdownMenuItem
              onSelect={() => retry.mutate(source.kbId)}
              disabled={retry.isPending}
            >
              {retry.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Retry
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => setOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{source.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the document from any agents currently referencing
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await del.mutateAsync(source.kbId);
                setOpen(false);
              }}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface Props {
  sources: KnowledgeSource[];
  agents: Agent[] | undefined;
  isLoading: boolean;
}

export function KbTable({ sources, agents, isLoading }: Props) {
  const [page, setPage] = useState(1);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const editingSource =
    sources.find((source) => source.kbId === editingKbId) ?? null;

  const agentName = (id: string | null) =>
    agents?.find((a) => a.agentId === id)?.name ?? null;

  const totalPages = Math.max(1, Math.ceil(sources.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const slice = sources.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 md:hidden">
        {slice.map((s) => {
          const { Icon, iconCls } = SOURCE_META[s.sourceType] ?? FALLBACK_META;
          const agent = agentName(s.agentId);
          const error = failureReason(s);
          const job = jobLabel(s);
          const progress = processingLabel(s);
          return (
            <div key={s.kbId} className="border bg-card p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded border ${iconCls}`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setEditingKbId(s.kbId)}
                    className="block w-full truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {s.name}
                  </button>
                  {s.originalFileName ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {s.originalFileName}
                    </p>
                  ) : null}
                  {error ? (
                    <p
                      className="mt-1 line-clamp-2 text-xs text-destructive"
                      title={error}
                    >
                      {error}
                    </p>
                  ) : null}
                </div>
                <RowActions source={s} onEdit={() => setEditingKbId(s.kbId)} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <KnowledgeSourceStatus source={s} compact />
                {progress ? (
                  <span className="capitalize text-xs text-muted-foreground">
                    {progress}
                  </span>
                ) : null}
                {agent ? (
                  <span className="text-xs text-muted-foreground">{agent}</span>
                ) : null}
              </div>
              {job ? (
                <p
                  className="mt-2 truncate font-mono text-[11px] text-muted-foreground"
                  title={job.full}
                >
                  Job {job.short}
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <p>Uploaded</p>
                  <p className="mt-1 text-foreground">
                    {fmtDate(s.uploadedAt)}
                  </p>
                </div>
                <div>
                  <p>Indexed</p>
                  <p className="mt-1 text-foreground">
                    {s.status === "ACTIVE" ? fmtDate(s.lastIndexedAt) : "—"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto border bg-card md:block">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow className="border-b bg-muted/20 hover:bg-muted/20">
              <TableHead className="w-12 pl-4">Type</TableHead>
              <TableHead className="whitespace-nowrap">Name</TableHead>
              <TableHead className="w-[360px] whitespace-nowrap">
                Status
              </TableHead>
              <TableHead className="w-36 whitespace-nowrap">Agent</TableHead>
              <TableHead className="w-32 whitespace-nowrap">Uploaded</TableHead>
              <TableHead className="w-32 whitespace-nowrap">Indexed</TableHead>
              <TableHead className="w-14 pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((s) => {
              const { Icon, iconCls } =
                SOURCE_META[s.sourceType] ?? FALLBACK_META;
              const agent = agentName(s.agentId);
              const error = failureReason(s);
              const job = jobLabel(s);
              const progress = processingLabel(s);
              return (
                <TableRow
                  key={s.kbId}
                  className="border-b transition-colors hover:bg-muted/10"
                >
                  {/* type icon */}
                  <TableCell className="pl-4">
                    <div
                      className={`flex size-8 items-center justify-center rounded border ${iconCls}`}
                    >
                      <Icon className="size-4" />
                    </div>
                  </TableCell>

                  {/* name + filename */}
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setEditingKbId(s.kbId)}
                      className="max-w-[260px] truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {s.name}
                    </button>
                    {s.originalFileName ? (
                      <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {s.originalFileName}
                      </p>
                    ) : null}
                    {error ? (
                      <p
                        className="mt-1 max-w-[320px] line-clamp-2 text-xs text-destructive"
                        title={error}
                      >
                        {error}
                      </p>
                    ) : null}
                  </TableCell>

                  <TableCell className="w-[360px] max-w-[360px] whitespace-normal align-top">
                    <KnowledgeSourceStatus source={s} />
                    {progress ? (
                      <p className="mt-1 max-w-28 truncate capitalize text-xs text-muted-foreground">
                        {progress}
                      </p>
                    ) : null}
                    {job ? (
                      <p
                        className="mt-1 max-w-28 truncate font-mono text-[10px] text-muted-foreground"
                        title={job.full}
                      >
                        {job.short}
                      </p>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-sm">
                    {agent ? (
                      <span className="text-foreground/80">{agent}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(s.uploadedAt)}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {s.status === "ACTIVE" ? fmtDate(s.lastIndexedAt) : "—"}
                  </TableCell>

                  <TableCell className="pr-4 text-right">
                    <RowActions
                      source={s}
                      onEdit={() => setEditingKbId(s.kbId)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* pagination bar */}
      <div className="flex flex-col gap-3 px-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end">
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <span className="whitespace-nowrap font-medium text-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(1)}
              disabled={currentPage <= 1}
              aria-label="First page"
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(totalPages)}
              disabled={currentPage >= totalPages}
              aria-label="Last page"
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <EditKbDialog
        source={editingSource}
        agents={agents ?? []}
        onOpenChange={(open) => {
          if (!open) setEditingKbId(null);
        }}
      />
    </div>
  );
}
