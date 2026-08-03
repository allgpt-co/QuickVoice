"use client";

import { useState } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";

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
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useReleaseNumber } from "@/src/hooks/queries/numbers";

export function ReleaseNumberDialog({
  phId,
  phoneNumber,
  compact = false,
}: {
  phId: string;
  phoneNumber: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const release = useReleaseNumber();
  const confirmed = confirmation.trim() === phoneNumber;
  const confirmationId = `release-number-${phId}`;

  async function confirmRelease() {
    if (!confirmed || release.isPending) return;
    try {
      await release.mutateAsync(phId);
      setOpen(false);
      setConfirmation("");
    } catch {
      // Mutation-level feedback keeps the dialog open so the user can retry.
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (release.isPending) return;
        setOpen(nextOpen);
        if (!nextOpen) setConfirmation("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon-sm" : "sm"}
          className={
            compact
              ? "text-destructive hover:text-destructive"
              : "w-full border-destructive/40 text-destructive hover:text-destructive"
          }
          aria-label={`Release ${phoneNumber}`}
        >
          <Trash2 />
          {compact ? null : "Release number"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Release {phoneNumber} permanently?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This immediately removes the number from QuickVoice and releases it
            at the telephony provider. Calls and routing stop, and the same
            number may never be available to buy again. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Releasing does not preserve or reserve this number. Update any
              published caller IDs, forwarding rules, and customer records
              first.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={confirmationId}>
            Type <span className="font-mono">{phoneNumber}</span> to confirm
          </Label>
          <Input
            id={confirmationId}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={phoneNumber}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={release.isPending}>
            Keep number
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!confirmed || release.isPending}
            onClick={(event) => {
              event.preventDefault();
              void confirmRelease();
            }}
          >
            {release.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Releasing…
              </>
            ) : (
              "Release permanently"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
