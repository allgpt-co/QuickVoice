"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";

import type { LiveCallRoom } from "@/src/lib/api/resources/calls";
import {
  isLifecycleEventForOrganization,
  liveCallFromLifecycle,
  type LiveCallEndedEvent,
  type LiveCallStartedEvent,
  type LiveCallUpdatedEvent,
  type LiveCallsClientEvents,
  type LiveCallsServerEvents,
} from "@/src/lib/live-calls/types";
import { SERVER_URL } from "@/src/lib/links";
import { queryKeys } from "@/src/lib/query-keys";

export type LiveSocketConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type LiveCallsSocket = Socket<
  LiveCallsServerEvents,
  LiveCallsClientEvents
>;

interface LiveCallsContextValue {
  socket: LiveCallsSocket | null;
  connectionState: LiveSocketConnectionState;
  organizationId: string;
  endedCallIds: ReadonlySet<string>;
  markCallEnded: (callId: string) => void;
}

const LiveCallsContext = createContext<LiveCallsContextValue | null>(null);

function upsertCall(current: LiveCallRoom[] | undefined, call: LiveCallRoom) {
  const existing = current ?? [];
  const index = existing.findIndex(
    (item) => item.callId === call.callId || item.roomName === call.roomName
  );
  if (index === -1) return [call, ...existing];
  const next = [...existing];
  next[index] = { ...next[index], ...call };
  return next;
}

export function LiveCallsProvider({
  children,
  organizationId,
}: {
  children: ReactNode;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<LiveCallsSocket | null>(null);
  const [connectionState, setConnectionState] =
    useState<LiveSocketConnectionState>("connecting");
  const [endedCallIds, setEndedCallIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const hasConnected = useRef(false);
  const markCallEnded = useCallback((callId: string) => {
    setEndedCallIds((current) => {
      if (current.has(callId)) return current;
      return new Set(current).add(callId);
    });
  }, []);

  useEffect(() => {
    const nextSocket: LiveCallsSocket = io(SERVER_URL, {
      autoConnect: false,
      withCredentials: true,
    });

    function onConnect() {
      hasConnected.current = true;
      setConnectionState("connected");
      void queryClient.invalidateQueries({ queryKey: queryKeys.calls.live() });
    }

    function onDisconnect() {
      setConnectionState(
        hasConnected.current ? "reconnecting" : "disconnected"
      );
    }

    function onConnectError() {
      setConnectionState(
        hasConnected.current ? "reconnecting" : "disconnected"
      );
    }

    function applyLifecycle(
      event: LiveCallStartedEvent | LiveCallUpdatedEvent
    ) {
      if (!isLifecycleEventForOrganization(event, organizationId)) return;
      queryClient.setQueryData<LiveCallRoom[]>(
        queryKeys.calls.live(),
        (current) => {
          const existing = current?.find((call) => call.callId === event.callId);
          return upsertCall(current, liveCallFromLifecycle(event, existing));
        }
      );
      setEndedCallIds((current) => {
        if (!current.has(event.callId)) return current;
        const next = new Set(current);
        next.delete(event.callId);
        return next;
      });
    }

    function onEnded(event: LiveCallEndedEvent) {
      if (!isLifecycleEventForOrganization(event, organizationId)) return;
      queryClient.setQueryData<LiveCallRoom[]>(
        queryKeys.calls.live(),
        (current) =>
          current?.filter(
            (call) =>
              call.callId !== event.callId && call.roomName !== event.roomName
          ) ?? []
      );
      setEndedCallIds((current) => new Set(current).add(event.callId));
    }

    nextSocket.on("connect", onConnect);
    nextSocket.on("disconnect", onDisconnect);
    nextSocket.on("connect_error", onConnectError);
    nextSocket.io.on("reconnect_attempt", () =>
      setConnectionState("reconnecting")
    );
    nextSocket.on("live-call:started", applyLifecycle);
    nextSocket.on("live-call:updated", applyLifecycle);
    nextSocket.on("live-call:ended", onEnded);

    const publishSocket = window.setTimeout(() => setSocket(nextSocket), 0);
    nextSocket.connect();

    return () => {
      window.clearTimeout(publishSocket);
      nextSocket.removeAllListeners();
      nextSocket.io.removeAllListeners();
      nextSocket.disconnect();
      hasConnected.current = false;
    };
  }, [organizationId, queryClient]);

  const value = useMemo<LiveCallsContextValue>(
    () => ({
      socket,
      connectionState,
      organizationId,
      endedCallIds,
      markCallEnded,
    }),
    [connectionState, endedCallIds, markCallEnded, organizationId, socket]
  );

  return (
    <LiveCallsContext.Provider value={value}>
      {children}
    </LiveCallsContext.Provider>
  );
}

export function useLiveCallsSocket() {
  const value = useContext(LiveCallsContext);
  if (!value) {
    throw new Error("useLiveCallsSocket must be used inside LiveCallsProvider");
  }
  return value;
}
