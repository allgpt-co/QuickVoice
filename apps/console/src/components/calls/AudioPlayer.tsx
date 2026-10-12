"use client";

import { useRef, useState } from "react";
import { Download, Music, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import { Button } from "@/src/components/ui/button";

function formatTime(seconds: number) {
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function AudioPlayer({ src }: { src: string | null }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playingSrc, setPlayingSrc] = useState<string | null>(null);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const playing = playingSrc === src;

    function seekTo(seconds: number) {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(audio.duration)) return;
        audio.currentTime = Math.max(0, Math.min(seconds, audio.duration));
        setPosition(audio.currentTime);
    }

    function skipBy(seconds: number) {
        if (audioRef.current) seekTo(audioRef.current.currentTime + seconds);
    }

    async function togglePlayback() {
        const audio = audioRef.current;
        if (!audio) return;

        if (playing) {
            audio.pause();
            setPlayingSrc(null);
            return;
        }

        try {
            if (audio.ended) seekTo(0);
            await audio.play();
            setPlayingSrc(src);
        } catch {
            setPlayingSrc(null);
        }
    }

    async function replay() {
        seekTo(0);
        const audio = audioRef.current;
        if (!audio) return;
        try {
            await audio.play();
            setPlayingSrc(src);
        } catch {
            setPlayingSrc(null);
        }
    }

    if (!src) {
        return (
            <div className="rounded-2xl border bg-background p-5 text-sm text-muted-foreground shadow-sm">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Music className="size-5" />
                </div>
                <p className="font-medium text-foreground">No recording available</p>
                <p className="mt-1 leading-relaxed">This call does not have an audio file attached.</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                    <Music className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Recording</p>
                    <p className="mt-1 text-xs text-muted-foreground">Listen to the captured call audio or download it for review.</p>
                </div>
            </div>
            <div className="mt-5 space-y-2">
                <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.1}
                    value={Math.min(position, duration)}
                    onChange={(event) => seekTo(Number(event.target.value))}
                    disabled={!duration}
                    aria-label="Recording position"
                    aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
                    className="h-6 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{formatTime(position)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
                <div className="flex flex-col items-center gap-1">
                    <Button type="button" variant="outline" size="icon" disabled={!duration} onClick={() => skipBy(-10)} aria-label="Back 10 seconds" title="Back 10 seconds">
                        <SkipBack />
                    </Button>
                    <span>Back 10s</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <Button type="button" size="icon" onClick={togglePlayback} aria-label={playing ? "Pause recording" : "Play recording"} title={playing ? "Pause" : "Play"}>
                        {playing ? <Pause /> : <Play />}
                    </Button>
                    <span>{playing ? "Pause" : "Play"}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <Button type="button" variant="outline" size="icon" disabled={!duration} onClick={() => skipBy(10)} aria-label="Forward 10 seconds" title="Forward 10 seconds">
                        <SkipForward />
                    </Button>
                    <span>Forward 10s</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <Button type="button" variant="outline" size="icon" onClick={replay} aria-label="Replay recording" title="Replay from start">
                        <RotateCcw />
                    </Button>
                    <span>Replay</span>
                </div>
            </div>
            <div className="mt-4">
                <Button asChild type="button" variant="outline" className="w-full justify-center">
                    <a href={src} target="_blank" rel="noreferrer" download>
                        <Download />
                        Download
                    </a>
                </Button>
            </div>
            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onLoadStart={() => { setPosition(0); setDuration(0); setPlayingSrc(null); }}
                onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
                onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
                onSeeked={(event) => setPosition(event.currentTarget.currentTime)}
                onEnded={() => setPlayingSrc(null)}
                onPause={() => setPlayingSrc(null)}
                onPlay={() => setPlayingSrc(src)}
            />
        </div>
    );
}
