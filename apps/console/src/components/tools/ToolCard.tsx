"use client";

import { useState } from "react";
import { Webhook, MoreVertical, Pencil, Trash2, Bot } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/src/components/ui/badge";
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
import { ToolSheet } from "@/src/components/tools/ToolSheet";
import { useDeleteTool } from "@/src/hooks/queries/tools";
import type { Tool } from "@/src/lib/api/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-300",
  POST: "bg-blue-500/10 text-blue-600 border-blue-500/25 dark:text-blue-300",
  PUT: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:text-amber-300",
  PATCH: "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:text-violet-300",
  DELETE: "bg-rose-500/10 text-rose-600 border-rose-500/25 dark:text-rose-300",
};

export function ToolCard({ tool }: { tool: Tool }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTool = useDeleteTool();

  const handleDelete = async () => {
    try {
      await deleteTool.mutateAsync(tool.toolId, {
        onSuccess: () => toast.success("Tool deleted"),
      });
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 rounded-lg border bg-card px-5 py-4 transition-colors hover:border-primary/30">
        {/* Icon */}
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Webhook className="size-5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{tool.name}</p>
            <Badge
              variant="outline"
              className={`rounded-full px-2 text-[11px] font-semibold ${METHOD_COLORS[tool.api_method] ?? ""}`}
            >
              {tool.api_method}
            </Badge>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground/70">{tool.api_url}</p>
          {tool.agent.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {tool.agent.slice(0, 3).map((a) => (
                <span
                  key={a.agentId}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <Bot className="size-3" />
                  {a.name}
                </span>
              ))}
              {tool.agent.length > 3 && (
                <span className="text-[11px] text-muted-foreground">
                  +{tool.agent.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Tool actions"
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ToolSheet mode="edit" tool={tool} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tool?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium">{tool.name}</span> from your organization and detach it from all agents. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
