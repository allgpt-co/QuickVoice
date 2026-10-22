"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  mergeTranscriptMessages,
  normalizeTranscriptMessage,
  type LiveCallEndedEvent,
  type LiveCallWatchAck,
  type LiveTranscriptMessage,
} from "@/src/lib/live-calls/types";
import { useLiveCallsSocket } from "@/src/providers/live-calls-provider";

export type TranscriptReplayState = "waiting" | "loading" | "ready" | "error";

export function useLiveTranscript(callId: string | null) {
  const {
    socket,
    connectionState,
    organizationId,
    endedCallIds,
    markCallEnded,
  } = useLiveCallsSocket();
  const [messages, setMessages] = useState<LiveTranscriptMessage[]>([]);
  const [replayState, setReplayState] =
    useState<TranscriptReplayState>(callId ? "waiting" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const watchAttempt = useRef(0);

  useEffect(() => {
    if (!socket || !callId) return;
    const activeSocket = socket;
    const activeCallId = callId;
    let disposed = false;
    let ended = false;
    let acknowledgementTimer: number | undefined;

    function addMessages(values: unknown[]) {
      const valid = values
        .map((value) =>
          normalizeTranscriptMessage(value, organizationId, activeCallId)
        )
        .filter((value): value is LiveTranscriptMessage => value !== null);
      if (valid.length) {
        setMessages((current) => mergeTranscriptMessages(current, valid));
      }
    }

    function onMessage(value: LiveTranscriptMessage) {
      addMessages([value]);
    }

    function onEnded(event: LiveCallEndedEvent) {
      if (
        event.organizationId === organizationId &&
        event.callId === activeCallId
      ) {
        ended = true;
        window.clearTimeout(acknowledgementTimer);
        setReplayState("ready");
        setError(null);
        markCallEnded(activeCallId);
      }
    }

    function watch() {
      const attempt = ++watchAttempt.current;
      window.clearTimeout(acknowledgementTimer);
      setReplayState("loading");
      setError(null);
      acknowledgementTimer = window.setTimeout(() => {
        if (!disposed && watchAttempt.current === attempt) {
          setReplayState("error");
          setError("Transcript history did not respond. Reconnecting will retry.");
        }
      }, 12_000);

      activeSocket.emit(
        "live-call:watch",
        { callId: activeCallId },
        (acknowledgement: LiveCallWatchAck) => {
          if (disposed || watchAttempt.current !== attempt) return;
          window.clearTimeout(acknowledgementTimer);
          if (!acknowledgement.ok) {
            if (ended) return;
            setReplayState("error");
            setError(acknowledgement.error.code === "NOT_FOUND"
              ? "Transcript is not available for this call. Retry if the call is still connecting."
              : acknowledgement.error.message);
            return;
          }
          addMessages(acknowledgement.messages);
          if (acknowledgement.status === "ended") markCallEnded(activeCallId);
          setReplayState("ready");
        }
      );
    }

    activeSocket.on("live-transcript:message", onMessage);
    activeSocket.on("live-call:ended", onEnded);
    activeSocket.on("connect", watch);
    if (activeSocket.connected) watch();

    return () => {
      disposed = true;
      watchAttempt.current += 1;
      window.clearTimeout(acknowledgementTimer);
      activeSocket.off("live-transcript:message", onMessage);
      activeSocket.off("live-call:ended", onEnded);
      activeSocket.off("connect", watch);
      if (activeSocket.connected) {
        activeSocket.emit(
          "live-call:unwatch",
          { callId: activeCallId },
          () => undefined
        );
      }
    };
  }, [callId, markCallEnded, organizationId, retryAttempt, socket]);

  return useMemo(
    () => ({
      messages,
      replayState,
      error,
      connectionState,
      isEnded: callId ? endedCallIds.has(callId) : false,
      markEnded: () => {
        if (callId) markCallEnded(callId);
      },
      retry: () => setRetryAttempt((current) => current + 1),
    }),
    [
      callId,
      connectionState,
      endedCallIds,
      error,
      markCallEnded,
      messages,
      replayState,
    ]
  );
}
