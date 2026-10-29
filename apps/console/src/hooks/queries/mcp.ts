"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mcpApi, type ConnectMcpInput, type McpCatalogParams } from "@/src/lib/api/resources/mcp";
import { queryKeys } from "@/src/lib/query-keys";

const isSafeSetupUrl = (setupUrl: string) => {
  try {
    const url = new URL(setupUrl);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
};

const openSetupAndPoll = (
  setupUrl: string,
  mcpConnectionId: string,
  qc: ReturnType<typeof useQueryClient>
): (() => void) => {
  if (!isSafeSetupUrl(setupUrl)) {
    toast.error("Setup URL is invalid or uses an unsupported protocol.");
    return () => {};
  }

  window.open(setupUrl, "_blank", "noopener,noreferrer");
  toast.info("Complete setup in the new tab. QuickVoice will refresh automatically.");
  let attempts = 0;
  let refreshing = false;
  const maxAttempts = 24;
  const intervalId = window.setInterval(refresh, 5000);
  const stop = () => {
    window.clearInterval(intervalId);
    window.removeEventListener("focus", refresh);
  };
  async function refresh() {
    if (refreshing || attempts >= maxAttempts) return;
    refreshing = true;
    attempts += 1;
    try {
      const connection = await mcpApi.refresh(mcpConnectionId);
      qc.invalidateQueries({ queryKey: queryKeys.mcp.all });
      qc.invalidateQueries({ queryKey: queryKeys.mcp.connections() });
      if (connection.status === "CONNECTED") {
        stop();
        toast.success(`${connection.displayName} connected`);
      }
    } catch {
      // Keep polling while the provider is still settling after OAuth.
    } finally {
      refreshing = false;
    }

    if (attempts >= maxAttempts) {
      stop();
    }
  }

  window.addEventListener("focus", refresh);
  return stop;
};

export function useMcpCatalog(params: McpCatalogParams = {}) {
  return useQuery({
    queryKey: queryKeys.mcp.catalog(params),
    queryFn: () => mcpApi.catalog(params),
    retry: false,
  });
}

export function useMcpConnections() {
  return useQuery({
    queryKey: queryKeys.mcp.connections(),
    queryFn: () => mcpApi.connections(),
  });
}

export function useAgentMcpConnections(agentId: string) {
  return useQuery({
    queryKey: queryKeys.mcp.agentConnections(agentId),
    queryFn: () => mcpApi.agentConnections(agentId),
    enabled: !!agentId,
  });
}

export function useConnectMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectMcpInput) => mcpApi.connect(input),
    onSuccess: (connection) => {
      qc.invalidateQueries({ queryKey: queryKeys.mcp.all });
      qc.invalidateQueries({ queryKey: queryKeys.mcp.connections() });
      if (connection.setupUrl) {
        toast.info("Setup is required. Click the Setup button to continue.");
        return;
      }
      toast.success("MCP connection created");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not connect MCP server");
    },
  });
}

export function useOpenMcpSetup() {
  const qc = useQueryClient();
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return (setupUrl: string, mcpConnectionId: string) => {
    if (typeof window === "undefined") return;
    cleanup.current?.();
    cleanup.current = openSetupAndPoll(setupUrl, mcpConnectionId, qc);
  };
}

export function useRefreshMcpConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mcpConnectionId: string) => mcpApi.refresh(mcpConnectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mcp.connections() });
      qc.invalidateQueries({ queryKey: queryKeys.mcp.all });
    },
    onError: (err: Error) => toast.error(err.message || "Could not refresh MCP connection"),
  });
}

export function useTestMcpAccess(id: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.mcp.all });
  };
  return useMutation({
    mutationFn: ({ toolName, arguments: args }: { toolName: string; arguments: Record<string, unknown> }) =>
      mcpApi.testAccess(id, toolName, args),
    onSettled: invalidate,
  });
}

export function useDisconnectMcpConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mcpConnectionId: string) => mcpApi.disconnect(mcpConnectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mcp.all });
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
      toast.success("MCP connection disconnected");
    },
    onError: (err: Error) => toast.error(err.message || "Could not disconnect MCP connection"),
  });
}

export function useAttachMcpConnection(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mcpConnectionId: string) => mcpApi.attach(mcpConnectionId, agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mcp.agentConnections(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.mcp.connections() });
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
    onError: (err: Error) => toast.error(err.message || "Could not attach MCP connection"),
  });
}

export function useDetachMcpConnection(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mcpConnectionId: string) => mcpApi.detach(mcpConnectionId, agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mcp.agentConnections(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.mcp.connections() });
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
    onError: (err: Error) => toast.error(err.message || "Could not detach MCP connection"),
  });
}
