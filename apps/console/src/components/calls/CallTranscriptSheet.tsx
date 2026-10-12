"use client";

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Hash,
  PhoneIncoming,
  PhoneOutgoing,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/src/components/ui/sheet";
import { Badge } from "@/src/components/ui/badge";
import { AudioPlayer } from "@/src/components/calls/AudioPlayer";
import { Transcript } from "@/src/components/calls/Transcript";
import { cn } from "@/src/lib/utils";
import type { CallLog } from "@/src/lib/api/types";

interface Props {
  call: CallLog | null;
  onClose: () => void;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function directionLabel(direction: string | null) {
  if (direction === "inbound") return "Inbound";
  if (direction === "outbound") return "Outbound";
  return "Unknown";
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background/70 p-4 shadow-sm transition-colors hover:bg-muted/40">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
        <Icon className="size-4" />
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function CallTranscriptSheet({ call, onClose }: Props) {
  const direction = directionLabel(call?.direction ?? null);
  const isInbound = call?.direction === "inbound";
  const DirectionIcon = isInbound ? PhoneIncoming : PhoneOutgoing;

  return (
    <Sheet open={!!call} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:w-[min(92vw,1040px)] data-[side=right]:sm:max-w-none data-[side=right]:xl:w-[1040px]"
      >
        <SheetHeader className="border-b bg-muted/30 px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <SheetDescription className="font-medium text-muted-foreground">
                Recording &amp; transcript
              </SheetDescription>
              <SheetTitle className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {call?.callerId ?? "Unknown caller"}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
                  <DirectionIcon className="size-3.5" />
                  {direction}
                </Badge>
                {call?.status ? (
                  <Badge
                    variant={call.status === "COMPLETED" ? "default" : "secondary"}
                    className={cn(
                      "gap-1.5 rounded-full px-3 py-1",
                      call.status === "COMPLETED" && "bg-blue-600 text-white"
                    )}
                  >
                    <CheckCircle2 className="size-3.5" />
                    {call.status.replace("_", " ")}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="grid gap-3 border-b bg-background/95 p-4 sm:grid-cols-3 sm:p-5 xl:p-6">
            <DetailStat
              icon={CalendarClock}
              label="Started"
              value={formatDate(call?.startTime ?? null)}
            />
            <DetailStat
              icon={Clock3}
              label="Duration"
              value={formatDuration(call?.durationSeconds ?? null)}
            />
            <DetailStat
              icon={Hash}
              label="Call ID"
              value={call?.callId ? `${call.callId.slice(0, 8)}…` : "—"}
            />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="border-b bg-muted/20 p-4 sm:p-6 lg:border-r lg:border-b-0 lg:p-6">
              <AudioPlayer src={call?.audioRecordingPath ?? null} callId={call?.callId ?? ""} />
              <div className="mt-5 rounded-xl border bg-background/70 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Review tip</p>
                <p className="mt-1 leading-relaxed">
                  Use the transcript to inspect handoff quality, caller intent, and any missed follow-up details.
                </p>
              </div>
            </aside>

            <section className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Transcript</h3>
                  <p className="text-xs text-muted-foreground">Conversation messages in chronological order.</p>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 sm:p-6">
                {call ? <Transcript callId={call.callId} /> : null}
              </div>
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
