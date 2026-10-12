"use client";

import { Loader2, PlugZap } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useAttachMcpConnection, useMcpConnections, useOpenMcpSetup, useRefreshMcpConnection } from "@/src/hooks/queries/mcp";
import type { AgentMcpConnection } from "@/src/lib/api/types";

export function McpPickerDialog({
  agentId,
  attachedConnections,
  open,
  onOpenChange,
}: {
  agentId: string;
  attachedConnections: AgentMcpConnection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: connections = [], isLoading } = useMcpConnections();
  const attach = useAttachMcpConnection(agentId);
  const refresh = useRefreshMcpConnection();
  const openSetup = useOpenMcpSetup();
  const attachedIds = new Set(attachedConnections.map((item) => item.mcpConnectionId));
  const available = connections.filter((connection) => !attachedIds.has(connection.mcpConnectionId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add MCP connection</DialogTitle>
          <DialogDescription>Choose a connected server to make its tools available to this agent.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 max-h-[min(60dvh,28rem)] space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading connections...</p>
          ) : !available.length ? (
            <p className="text-sm text-muted-foreground">
              No available MCP connections. Connect one from the MCP marketplace first.
            </p>
          ) : (
            available.map((connection) => (
              <div key={connection.mcpConnectionId} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <PlugZap className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-sm font-medium">{connection.displayName}</p>
                    <Badge
                      variant={connection.status === "CONNECTED" ? "secondary" : "outline"}
                      className={connection.status === "ERROR" ? "border-destructive/30 text-destructive" : ""}
                    >
                      {connection.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={connection.mcpUrl}>
                    {(connection.tools?.length ?? 0)} tools · {connection.mcpUrl}
                  </p>
                  {typeof connection.metadata?.lastSyncError === "string" && (
                    <p className="mt-1 text-xs text-destructive" role="status">{connection.metadata.lastSyncError}</p>
                  )}
                </div>
                {connection.status === "CONNECTED" ? <Button
                  size="sm"
                  className="col-span-2 w-full sm:col-span-1 sm:w-auto"
                  disabled={attach.isPending}
                  onClick={() =>
                    attach.mutate(connection.mcpConnectionId, {
                      onSuccess: () => onOpenChange(false),
                    })
                  }
                >
                  {attach.isPending && attach.variables === connection.mcpConnectionId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlugZap className="size-4" />
                  )}
                  Attach
                </Button> : <Button
                  size="sm"
                  variant="outline"
                  className="col-span-2 w-full sm:col-span-1 sm:w-auto"
                  disabled={refresh.isPending && refresh.variables === connection.mcpConnectionId}
                  onClick={() => connection.setupUrl
                    ? openSetup(connection.setupUrl, connection.mcpConnectionId)
                    : refresh.mutate(connection.mcpConnectionId, {
                        onSuccess: (updated) => {
                          if (updated.setupUrl) openSetup(updated.setupUrl, updated.mcpConnectionId);
                        },
                      })}
                >
                  {refresh.isPending && refresh.variables === connection.mcpConnectionId && <Loader2 className="size-4 animate-spin" />}
                  {connection.setupUrl ? "Complete setup" : "Retry setup"}
                </Button>}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
