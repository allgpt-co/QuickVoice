"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  mcpApi,
  type ConnectMcpInput,
  type McpCatalogParams,
} from "@/src/lib/api/resources/mcp";
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

export const pollMcpSetup = (
  mcpConnectionId: string,
  qc: ReturnType<typeof useQueryClient>,
  onSettled?: (connected: boolean) => void,
): (() => void) => {
  let attempts = 0;
  let failures = 0;
  let refreshing = false;
  let stopped = false;
  // Consent can take several minutes. The return page starts a fresh sync even
  // when the original tab has been closed or its polling window has elapsed.
  const maxAttempts = 120;
  const intervalId = window.setInterval(refresh, 5000);
  const stop = () => {
    stopped = true;
    window.clearInterval(intervalId);
    window.removeEventListener("focus", refresh);
  };
  const finish = (message: string, success = false) => {
    stop();
    if (success) toast.success(message);
    else toast.error(message);
    onSettled?.(success);
  };
  async function refresh() {
    if (stopped || refreshing) return;
    refreshing = true;
    attempts += 1;
    try {
      const connection = await mcpApi.refresh(mcpConnectionId);
      if (stopped) return;
      void qc.invalidateQueries({ queryKey: queryKeys.mcp.all });
      if (connection.status === "CONNECTED") {
        finish(`${connection.displayName} connected`, true);
      } else if (["ERROR", "DISCONNECTED"].includes(connection.status)) {
        failures += 1;
        if (failures >= 3)
          finish(
            typeof connection.metadata?.lastSyncError === "string"
              ? connection.metadata.lastSyncError
              : "Could not finish connecting. Retry sync from Connected MCPs.",
          );
      } else {
        failures = 0;
      }
    } catch (error) {
      if (stopped) return;
      failures += 1;
      if (failures >= 3)
        finish(
          error instanceof Error
            ? error.message
            : "Could not check the connection. Retry from Connected MCPs.",
        );
    } finally {
      refreshing = false;
    }
    if (!stopped && attempts >= maxAttempts)
      finish(
        "Authorization is still pending. Complete setup, then return to QuickVoice.",
      );
  }
  window.addEventListener("focus", refresh);
  void refresh();
  return stop;
};

// A same-origin channel lets the return tab notify its initiator without giving
// the external authorization page access to window.opener.
const setupChannel = (id: string): BroadcastChannel | null => {
  try {
    return new BroadcastChannel(`quickvoice-mcp-setup:${id}`);
  } catch {
    return null;
  }
};

export function useMcpSetupReturn(selectTab: (tab: string) => void) {
  const qc = useQueryClient();
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("mcpConnectionId");
    if (
      !id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return;
    selectTab("connections");
    toast.info("Checking authorization and syncing your integration…");
    // A redirect is not proof of authorization. The tenant-scoped API verifies
    // the provider account and its tools before the UI reports Connected.
    const channel = setupChannel(id);
    let acknowledgementTimeout: number | undefined;
    const stopPolling = pollMcpSetup(id, qc, (connected) => {
      const current = new URL(window.location.href);
      current.searchParams.delete("mcpConnectionId");
      window.history.replaceState(window.history.state, "", current.href);
      if (!connected || !channel) return;
      channel.onmessage = ({ data }) => {
        if (data !== "return-acknowledged") return;
        window.clearTimeout(acknowledgementTimeout);
        channel.close();
        window.close();
        // Shown only if the browser refuses to close this tab.
        toast.info(
          "Connected. You can close this tab and return to your original QuickVoice tab.",
        );
      };
      acknowledgementTimeout = window.setTimeout(() => channel.close(), 2000);
      channel.postMessage("setup-completed");
    });
    return () => {
      stopPolling();
      window.clearTimeout(acknowledgementTimeout);
      channel?.close();
    };
  }, [qc, selectTab]);
}

export function useMcpCatalog(params: McpCatalogParams = {}) {
  return useQuery({
    queryKey: queryKeys.mcp.catalog(params),
    queryFn: () => mcpApi.catalog(params),
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useMcpConnections() {
  return useQuery({
    queryKey: queryKeys.mcp.connections(),
    queryFn: () => mcpApi.connections(),
    refetchOnWindowFocus: true,
  });
}

export function useAgentMcpConnections(agentId: string) {
  return useQuery({
    queryKey: queryKeys.mcp.agentConnections(agentId),
    queryFn: () => mcpApi.agentConnections(agentId),
    refetchOnWindowFocus: true,
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
    if (!isSafeSetupUrl(setupUrl)) {
      toast.error("Setup URL is invalid or uses an unsupported protocol.");
      return;
    }
    const channel = setupChannel(mcpConnectionId);
    if (channel)
      channel.onmessage = ({ data }) => {
        if (data !== "setup-completed") return;
        // Re-fetch authoritative connection data; channel messages never set status.
        void qc.invalidateQueries({ queryKey: queryKeys.mcp.all });
        channel.postMessage("return-acknowledged");
        window.focus();
        cleanup.current?.();
      };
    window.open(setupUrl, "_blank", "noopener,noreferrer");
    toast.info(
      "Complete setup in the new tab. You will return to QuickVoice automatically.",
    );
    const stopPolling = pollMcpSetup(mcpConnectionId, qc);
    cleanup.current = () => {
      stopPolling();
      channel?.close();
    };
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
