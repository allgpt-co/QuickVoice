"use client";

import { useCallback, useEffect, useRef, useState, RefObject } from "react";
import clsx from "clsx";
import AudioPlayer from "react-h5-audio-player";

export type TranscriptLine = {
  time: number;
  speaker: "Agent" | "Customer";
  text: string;
};

export function TypingTranscript({
  audioRef,
  transcript,
  typingSpeed = 36,
  isPlaying,
}: {
  audioRef: RefObject<AudioPlayer | null>;
  transcript: TranscriptLine[];
  typingSpeed?: number;
  isPlaying: boolean;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [typedLines, setTypedLines] = useState<string[]>([]);
  const [audioIsPlaying, setAudioIsPlaying] = useState(isPlaying);
  const prevTime = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalsRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  const playbackActive = isPlaying || audioIsPlaying;
  const clearTypingIntervals = useCallback(() => {
    intervalsRef.current.forEach(clearInterval);
    intervalsRef.current.clear();
  }, []);

  /** Attach after the nested audio element exists; some marketing pages mount it after this component. */
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const attach = () => {
      const audio = audioRef.current?.audio.current;
      if (!audio || cleanup) return false;

      const onPlay = () => {
        setAudioIsPlaying(true);
        setCurrentTime(audio.currentTime);
      };
      const onPause = () => setAudioIsPlaying(false);
      const onEnded = () => setAudioIsPlaying(false);
      const onTimeUpdate = () => {
        if (!audio.paused) setCurrentTime(audio.currentTime);
      };

      audio.addEventListener("play", onPlay);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("timeupdate", onTimeUpdate);
      cleanup = () => {
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("timeupdate", onTimeUpdate);
      };
      return true;
    };

    if (attach()) return () => cleanup?.();
    const poll = setInterval(() => {
      if (attach()) clearInterval(poll);
    }, 100);

    return () => {
      clearInterval(poll);
      cleanup?.();
    };
  }, [audioRef]);

  /** Handle backward seek */
  useEffect(() => {
    if (!playbackActive) return;

    if (currentTime < prevTime.current) {
      const validIndex = transcript.findLastIndex((line) => line.time <= currentTime);
      clearTypingIntervals();
      setTypedLines((prev) => prev.slice(0, validIndex + 1));
    }

    prevTime.current = currentTime;
  }, [currentTime, transcript, playbackActive, clearTypingIntervals]);

  /** Pause should stop character timers without losing already typed text. */
  useEffect(() => {
    if (playbackActive) return;
    clearTypingIntervals();
  }, [playbackActive, clearTypingIntervals]);

  /** Start or resume typing due lines. */
  useEffect(() => {
    if (!playbackActive) return;

    transcript.forEach((line, idx) => {
      const typedText = typedLines[idx] ?? "";
      if (currentTime < line.time || intervalsRef.current.has(idx) || typedText.length >= line.text.length) {
        return;
      }

      let charIndex = typedText.length;
      const interval = setInterval(() => {
        setTypedLines((prev) => {
          const next = [...prev];
          next[idx] = line.text.slice(0, charIndex + 1);
          return next;
        });

        charIndex += 1;
        if (charIndex >= line.text.length) {
          clearInterval(interval);
          intervalsRef.current.delete(idx);
        }
      }, typingSpeed);

      intervalsRef.current.set(idx, interval);
    });
  }, [currentTime, transcript, typedLines, typingSpeed, playbackActive]);

  /** Auto-scroll */
  useEffect(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [typedLines]);

  useEffect(() => clearTypingIntervals, [clearTypingIntervals]);

  return (
    <div
      ref={containerRef}
      className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-border bg-background p-4"
      aria-live="polite"
    >
      {/* Empty state */}
      {!playbackActive && typedLines.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Click on <span className="mx-1 font-semibold text-primary">Play</span> button to generate transcript
        </div>
      )}

      {transcript.map((line, idx) => {
        const typedText = typedLines[idx];
        if (!typedText) return null;

        const isTyping = typedText.length < line.text.length;
        const isAgent = line.speaker === "Agent";

        return (
          <div key={idx} className={clsx("flex", isAgent ? "justify-start" : "justify-end")}>
            <div
              className={clsx(
                "max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                isAgent ? "rounded-bl-sm bg-primary text-primary-foreground" : "rounded-br-sm bg-muted text-foreground",
              )}
            >
              <div
                className={clsx(
                  "mb-0.5 text-xs font-semibold",
                  isAgent ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {line.speaker}
              </div>

              <span>
                {typedText}
                {isTyping && <span className="ml-0.5 animate-pulse">▍</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
