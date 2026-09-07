"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics";

export function OpenSourcePageView() {
  useEffect(() => {
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const reportPageView = () => {
      const reported = trackAnalyticsEvent("oss_page_view", {
        page_path: window.location.pathname,
        page_title: document.title,
      });

      if (!reported && attempts < 20) {
        attempts += 1;
        retryTimer = setTimeout(reportPageView, 250);
      }
    };

    reportPageView();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return null;
}

export function QuickstartCopyButton({ commands }: { commands: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(commands);
      setStatus("copied");
      trackAnalyticsEvent("quickstart_copy", {
        copy_target: "local_quickstart",
        page_path: window.location.pathname,
      });
    } catch {
      setStatus("error");
    }

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus("idle"), 2400);
  };

  const label =
    status === "copied"
      ? "Copied"
      : status === "error"
        ? "Copy failed"
        : "Copy commands";

  return (
    <button
      type="button"
      onClick={copyCommands}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-500 bg-slate-800 px-3 font-mono text-xs font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      aria-live="polite"
    >
      {status === "copied" ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
      {label}
    </button>
  );
}
