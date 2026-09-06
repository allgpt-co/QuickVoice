"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { resolveGoogleAnalyticsId } from "@/lib/google-analytics-config.mjs";
import { createPageviewCoordinator } from "@/lib/google-analytics-pageviews.mjs";
import type {} from "@/lib/analytics";

/** Own both initial and subsequent pageviews when the rollout flag is enabled. */
export function GoogleAnalytics({
  script,
  configuredId,
  manualPageviews,
}: {
  script: string;
  configuredId: string;
  manualPageviews: boolean;
}) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const coordinator = useRef<ReturnType<typeof createPageviewCoordinator> | null>(null);

  useEffect(() => {
    if (!manualPageviews) return;
    const measurementId = resolveGoogleAnalyticsId(configuredId, window.location.hostname);
    if (!measurementId) return;

    if (!coordinator.current) {
      coordinator.current = createPageviewCoordinator(measurementId, (parameters) => {
        // The bootstrap configures the destination before inserting this tag.
        // A delayed bootstrap must not lose the initial visit or send prematurely.
        if (!window.gtag || !document.getElementById("quickvoice-google-tag")) return false;
        window.gtag("event", "page_view", parameters);
        return true;
      });
    }
    const current = coordinator.current;
    // Read metadata after React's route commit, not at the history mutation.
    // Cleanup drops a pending callback when a navigation is superseded.
    const timer = window.setTimeout(() => {
      if (
        window.location.pathname !== pathname ||
        new URLSearchParams(window.location.search).toString() !== query
      ) return;
      current.record({
        url: window.location.href,
        title: document.title,
        referrer: document.referrer,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, query, configuredId, manualPageviews]);

  return (
    <Script
      id="google-analytics"
      strategy="afterInteractive"
      onReady={() => coordinator.current?.flush()}
    >
      {script}
    </Script>
  );
}
