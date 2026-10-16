"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import type { Voice } from "@/src/lib/data/voices";
import { agentsApi } from "@/src/lib/api/resources/agents";
import type { VoiceSample } from "@/src/lib/api/types";

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "-";
}

export function VoiceProfilePanel({
  agentId,
  voice,
  language,
  languageLabel,
  ttsModel,
  ttsModelLabel,
  sampleText,
  canPreview,
}: {
  agentId: string;
  voice?: Voice;
  language: string;
  languageLabel: string;
  ttsModel: string;
  ttsModelLabel: string;
  sampleText?: string | null;
  canPreview: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const cachedSample = useRef<VoiceSample | null>(null);
  const clearPlayback = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (player.current) {
      player.current.onended = null;
      player.current.onerror = null;
      player.current.pause();
      player.current.removeAttribute("src");
      player.current.load();
      player.current = null;
    }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }, []);
  useEffect(() => clearPlayback, [clearPlayback]);
  const tags = useMemo(
    () => [...(voice?.styles ?? []), ...(voice?.useCases ?? [])].slice(0, 8),
    [voice?.styles, voice?.useCases]
  );

  async function previewVoice() {
    if (request.current) {
      clearPlayback();
      setStatus("idle");
      return;
    }
    if (!canPreview || !voice || !sampleText) return;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setStatus("loading");
    try {
      const sample = cachedSample.current ?? await agentsApi.createVoiceSample(
        agentId, { language, ttsModel, voiceId: voice.id }, controller.signal,
      );
      if (controller.signal.aborted) return;
      cachedSample.current = sample;
      const bytes = Uint8Array.from(atob(sample.audioBase64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: sample.contentType }));
      audioUrl.current = url;
      const audio = new Audio(url);
      player.current = audio;
      audio.onended = () => {
        clearPlayback();
        setStatus("idle");
      };
      audio.onerror = () => {
        clearPlayback();
        setStatus("idle");
        setError("Could not play this voice sample. Please try again.");
      };
      await audio.play();
      if (!controller.signal.aborted) setStatus("playing");
    } catch (cause) {
      if (controller.signal.aborted) return;
      clearPlayback();
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : "Could not preview this voice. Please try again.");
    }
  }

  if (!voice) {
    return (
      <div className="border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        Select a compatible voice to view profile details.
      </div>
    );
  }

  return (
    <div className="border bg-muted/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{voice.name}</h3>
            <Badge variant="outline">{voice.provider}</Badge>
            <Badge variant="secondary">{ttsModelLabel}</Badge>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Gender</p>
              <p className="mt-1 font-medium">{titleCase(voice.gender)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Language</p>
              <p className="mt-1 font-medium">{languageLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Accent</p>
              <p className="mt-1 font-medium">{voice.accent || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Languages</p>
              <p className="mt-1 font-medium tabular-nums">
                {voice.languages.length}
              </p>
            </div>
          </div>
          {tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 shrink-0 flex-col gap-3 lg:w-72">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void previewVoice()}
            disabled={!canPreview || !sampleText}
          >
            {status === "loading" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : status === "playing" ? <Square className="size-4" /> : <Volume2 className="size-4" />}
            {status === "loading" ? "Cancel preview" : status === "playing" ? "Stop sample" : "Preview voice"}
          </Button>
          <p role="status" className="text-xs text-muted-foreground">
            {status === "loading" ? "Generating your voice sample…" : status === "playing" ? `Playing ${voice.name} in ${languageLabel}.` : "Listen using your current model and voice selections."}
          </p>
          {sampleText ? <p lang={language} dir="auto" className="break-words border bg-background p-3 text-sm leading-relaxed">{sampleText}</p> : <p className="text-xs text-muted-foreground">A sample is unavailable for this language.</p>}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
