"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/src/components/ui/alert-dialog";
import { useDeleteKb } from "@/src/hooks/queries/kb";

export function DeleteKbButton({ kbId, name }: { kbId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const del = useDeleteKb();

  async function onDelete() {
    try {
      await del.mutateAsync(kbId);
      setOpen(false);
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Delete">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the document from any agents currently referencing it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} disabled={del.isPending}>
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
  );
}
