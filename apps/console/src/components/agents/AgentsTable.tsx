"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { AgentPreviewPanel } from "@/src/components/agents/AgentPreviewPanel";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useDeleteAgent, useUpdateAgent } from "@/src/hooks/queries/agents";
import type { Agent } from "@/src/lib/api/types";
import { cn } from "@/src/lib/utils";

const PAGE_SIZE = 10;

// ── configured chip ───────────────────────────────────────────────────────────

function ConfiguredChip({ configured }: { configured: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-default items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium",
            configured
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-muted bg-muted/30 text-muted-foreground",
          )}
        >
          <BadgeCheck className="size-3" />
          {configured ? "Configured" : "Not set"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {configured
          ? "Agent has a saved configuration"
          : "Open the agent to configure voice, prompts, and tools"}
      </TooltipContent>
    </Tooltip>
  );
}

// ── status switch row ─────────────────────────────────────────────────────────

function StatusCell({ agent }: { agent: Agent }) {
  const update = useUpdateAgent(agent.agentId);
  return (
    <Switch
      checked={agent.isActive}
      onCheckedChange={(v) => update.mutate({ isActive: v })}
      disabled={update.isPending}
      aria-label={agent.isActive ? "Pause agent" : "Resume agent"}
    />
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  agents: Agent[];
  isLoading: boolean;
}

export function AgentsTable({ agents, isLoading }: Props) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [previewTarget, setPreviewTarget] = useState<Agent | null>(null);
  const deleteAgent = useDeleteAgent();

  const totalPages = Math.max(1, Math.ceil(agents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const slice = agents.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteAgent.mutateAsync(deleteTarget.agentId);
    setDeleteTarget(null);
  }

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
        {slice.map((agent) => (
          <div key={agent.agentId} className="border bg-card p-4">
            <div className="flex items-start gap-3">
              <div
                className="min-w-0 flex-1"
                onClick={() => router.push(`/agents/${agent.agentId}`)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {agent.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {agent.agentSlug}
                    </p>
                  </div>
                </div>
              </div>
              <StatusCell agent={agent} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <ConfiguredChip configured={agent.isConfigured} />
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Preview ${agent.name}`}
                  onClick={() => setPreviewTarget(agent)}
                >
                  <FlaskConical />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${agent.name}`}
                  onClick={() => setDeleteTarget(agent)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 border bg-background text-center text-xs">
              <div className="border-r px-2 py-2">
                <p className="font-semibold text-foreground">
                  {agent.phoneNumbersCount}
                </p>
                <p className="text-muted-foreground">Numbers</p>
              </div>
              <div className="border-r px-2 py-2">
                <p className="font-semibold text-foreground">
                  {agent.callLogsCount}
                </p>
                <p className="text-muted-foreground">Calls</p>
              </div>
              <div className="border-r px-2 py-2">
                <p className="font-semibold text-foreground">
                  {agent.knowledgeSourcesCount}
                </p>
                <p className="text-muted-foreground">Docs</p>
              </div>
              <div className="px-2 py-2">
                <p className="font-semibold text-foreground">
                  {agent.toolsCount}
                </p>
                <p className="text-muted-foreground">Tools</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* ── table ── */}
      <div className="hidden overflow-x-auto border bg-card md:block">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="pl-4 whitespace-nowrap">Agent</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32">Configured</TableHead>
              <TableHead className="w-24 text-right whitespace-nowrap">
                Numbers
              </TableHead>
              <TableHead className="w-24 text-right whitespace-nowrap">
                Calls
              </TableHead>
              <TableHead className="w-24 text-right whitespace-nowrap">
                Docs
              </TableHead>
              <TableHead className="w-24 text-right whitespace-nowrap">
                Tools
              </TableHead>
              <TableHead className="w-14 pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((agent) => (
              <TableRow
                key={agent.agentId}
                onClick={() => router.push(`/agents/${agent.agentId}`)}
                className="cursor-pointer border-b transition-colors hover:bg-muted/10"
              >
                {/* agent name + slug */}
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <Bot className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="max-w-[200px] truncate text-sm font-medium text-foreground">
                        {agent.name}
                      </p>
                      <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {agent.agentSlug}
                      </p>
                    </div>
                  </div>
                </TableCell>

                {/* active toggle — stop propagation so the toggle doesn't also navigate */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <StatusCell agent={agent} />
                </TableCell>

                {/* configured */}
                <TableCell>
                  <ConfiguredChip configured={agent.isConfigured} />
                </TableCell>

                {/* stats */}
                <TableCell className="text-right tabular-nums text-sm">
                  {agent.phoneNumbersCount}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {agent.callLogsCount}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {agent.knowledgeSourcesCount}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {agent.toolsCount}
                </TableCell>

                {/* actions — stop propagation so the menu doesn't also navigate */}
                <TableCell
                  className="pr-4 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
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
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/agents/${agent.agentId}`}
                          className="flex items-center gap-2"
                        >
                          <Pencil className="size-4" /> Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPreviewTarget(agent)}>
                        <FlaskConical className="size-4" /> Test
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(agent)}
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
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {deleteTarget?.name ?? "this agent"} and detaches it
              from phone numbers, tools, and knowledge sources. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteAgent.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAgent.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {previewTarget ? (
        <AgentPreviewPanel
          agentId={previewTarget.agentId}
          agentName={previewTarget.name}
          open
          onOpenChange={(open) => {
            if (!open) setPreviewTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
