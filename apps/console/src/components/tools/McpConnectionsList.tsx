"use client";

import { AlertCircle, ExternalLink, Loader2, RefreshCw, ServerCrash, Trash2 } from "lucide-react";
import { McpToolBadges } from "@/src/components/tools/McpToolBadges";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
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
  AlertDialogTrigger,
} from "@/src/components/ui/alert-dialog";
import {
  useDisconnectMcpConnection,
  useMcpConnections,
  useOpenMcpSetup,
  useRefreshMcpConnection,
} from "@/src/hooks/queries/mcp";
import type { McpConnectionStatus } from "@/src/lib/api/types";

const STATUS_CLASS: Record<McpConnectionStatus, string> = {
  CONNECTED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PENDING: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  AUTH_REQUIRED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  INPUT_REQUIRED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  ERROR: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  DISCONNECTED: "bg-muted text-muted-foreground",
};

const hasMissingGoogleDriveScope = (metadata?: Record<string, unknown> | null) =>
  metadata?.scopeIssue === "missing_google_drive_scope";

export function McpConnectionsList() {
  const { data: connections = [], isLoading } = useMcpConnections();
  const refresh = useRefreshMcpConnection();
  const disconnect = useDisconnectMcpConnection();
  const openMcpSetup = useOpenMcpSetup();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    );
  }

  if (!connections.length) {
    return (
      <EmptyState
        icon={ServerCrash}
        title="No MCP connections"
        description="Connect a verified marketplace server or add a custom MCP URL."
      />
    );
  }

  return (
    <div className="space-y-3">
      {connections.map((connection) => {
        const missingGoogleDriveScope = hasMissingGoogleDriveScope(connection.metadata);
        return (
          <div key={connection.mcpConnectionId} className="border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{connection.displayName}</p>
                  <Badge className={STATUS_CLASS[connection.status]}>
                    {missingGoogleDriveScope ? "DRIVE ACCESS NOT GRANTED" : connection.status.replace("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{connection.mcpUrl}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {(connection.tools?.length ?? 0)} tools synced
                  {connection.lastSyncedAt ? ` - Last synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : ""}
                </p>
                {missingGoogleDriveScope && (
                  <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                    On the Google consent screen, check Google Drive access before continuing.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {connection.setupUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openMcpSetup(connection.setupUrl as string, connection.mcpConnectionId)}
                  >
                    <ExternalLink className="size-4" />
                    {missingGoogleDriveScope ? "Re-authorize" : "Setup"}
                  </Button>
                )}
                {!connection.setupUrl && ["ERROR", "DISCONNECTED"].includes(connection.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={refresh.isPending && refresh.variables === connection.mcpConnectionId}
                    onClick={() => {
                      refresh.mutate(connection.mcpConnectionId, {
                        onSuccess: (updated) => {
                          if (updated.setupUrl) {
                            openMcpSetup(updated.setupUrl, updated.mcpConnectionId);
                          }
                        },
                      });
                    }}
                  >
                    {refresh.isPending && refresh.variables === connection.mcpConnectionId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <AlertCircle className="size-4" />
                    )}
                    {missingGoogleDriveScope ? "Re-authorize" : "Retry setup"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={refresh.isPending && refresh.variables === connection.mcpConnectionId}
                  onClick={() => refresh.mutate(connection.mcpConnectionId)}
                >
                  {refresh.isPending && refresh.variables === connection.mcpConnectionId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Refresh
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={disconnect.isPending && disconnect.variables === connection.mcpConnectionId}
                    >
                      {disconnect.isPending && disconnect.variables === connection.mcpConnectionId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect MCP?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove <span className="font-medium">{connection.displayName}</span> from your
                        organization and detach it from all agents.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => disconnect.mutate(connection.mcpConnectionId)}
                      >
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <McpToolBadges tools={connection.tools} />
          </div>
        );
      })}
    </div>
  );
}
