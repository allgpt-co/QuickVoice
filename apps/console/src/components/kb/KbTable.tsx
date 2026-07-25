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
import { useDeleteKb } from "@/src/hooks/queries/kb";
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

function RowActions({
  source,
  onEdit,
}: {
  source: KnowledgeSource;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const del = useDeleteKb();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Row actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4" /> View / edit
          </DropdownMenuItem>
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
            <AlertDialogTitle>Delete &quot;{source.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the document from any agents currently referencing it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await del.mutateAsync(source.kbId); setOpen(false); }}
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
  const slice = sources.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 md:hidden">
        {slice.map((s) => {
          const { Icon, iconCls } = SOURCE_META[s.sourceType] ?? FALLBACK_META;
          const agent = agentName(s.agentId);
          return (
            <div
              key={s.kbId}
              className="border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className={`flex size-8 shrink-0 items-center justify-center rounded border ${iconCls}`}>
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
                </div>
                <RowActions source={s} onEdit={() => setEditingKbId(s.kbId)} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <KnowledgeSourceStatus source={s} compact />
                {agent ? (
                  <span className="text-xs text-muted-foreground">{agent}</span>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <p>Uploaded</p>
                  <p className="mt-1 text-foreground">{fmtDate(s.uploadedAt)}</p>
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
              <TableHead className="w-[360px] whitespace-nowrap">Status</TableHead>
              <TableHead className="w-36 whitespace-nowrap">Agent</TableHead>
              <TableHead className="w-32 whitespace-nowrap">Uploaded</TableHead>
              <TableHead className="w-32 whitespace-nowrap">Indexed</TableHead>
              <TableHead className="w-14 pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((s) => {
              const { Icon, iconCls } = SOURCE_META[s.sourceType] ?? FALLBACK_META;
              const agent = agentName(s.agentId);
              return (
                <TableRow
                  key={s.kbId}
                  className="border-b transition-colors hover:bg-muted/10"
                >
                  {/* type icon */}
                  <TableCell className="pl-4">
                    <div className={`flex size-8 items-center justify-center rounded border ${iconCls}`}>
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
                  </TableCell>

                  <TableCell className="align-top"><KnowledgeSourceStatus source={s} /></TableCell>

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
                    <RowActions source={s} onEdit={() => setEditingKbId(s.kbId)} />
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
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="icon" className="size-8" onClick={() => setPage(1)} disabled={page <= 1} aria-label="First page">
              <ChevronsLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="Last page">
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
