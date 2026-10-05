"use client";

import { useState } from "react";
import {
  Clipboard,
  KeyRound,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { EmptyState } from "@/src/components/common/EmptyState";
import { useDeleteSecret, useSecrets } from "@/src/hooks/queries/secrets";
import type { Secret } from "@/src/lib/api/types";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function SecretSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function SecretsTable({ onCreate }: { onCreate: () => void }) {
  const { data: secrets = [], isLoading, isError, isFetching, refetch } =
    useSecrets();
  const deleteSecret = useDeleteSecret();
  const [deleteTarget, setDeleteTarget] = useState<Secret | null>(null);

  async function copyReference(secret: Secret) {
    await navigator.clipboard.writeText(secret.reference);
    toast.success("Secret reference copied");
  }

  async function confirmDelete() {
    try {
      if (!deleteTarget) return;
      await deleteSecret.mutateAsync(deleteTarget.secretId, {
        onSuccess: () => {
          toast.success("Secret deleted");
          setDeleteTarget(null);
        },
      });
    } catch {
      // The mutation hook displays the API error; preserve the current state for retry.
    }
  }

  if (isLoading) return <SecretSkeleton />;

  if (isError) {
    return (
      <EmptyState
        icon={KeyRound}
        title="Could not load secrets"
        description="Refresh the secrets list or try again after checking your connection."
        action={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            Retry
          </Button>
        }
      />
    );
  }

  if (!secrets.length) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No secrets yet"
        description="Save reusable credentials for tools and webhooks without exposing values in the console."
        action={<Button onClick={onCreate}>Add secret</Button>}
      />
    );
  }

  return (
    <>
      <div className="border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-12 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {secrets.map((secret) => (
              <TableRow key={secret.secretId}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center border bg-primary/10 text-primary">
                      <KeyRound className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{secret.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Secret value hidden
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="rounded-sm border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {secret.reference}
                  </code>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(secret.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${secret.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Secret actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => copyReference(secret)}>
                        <Clipboard className="size-4" />
                        Copy reference
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(secret)}
                      >
                        <Trash2 className="size-4" />
                        Delete secret
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteSecret.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the secret named {deleteTarget?.name}. Existing tools
              or webhooks using its reference may fail until they are updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSecret.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
              disabled={deleteSecret.isPending}
            >
              {deleteSecret.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Delete secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
