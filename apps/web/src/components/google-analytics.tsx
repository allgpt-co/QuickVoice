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
  const recordCurrent = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    coordinator.current?.reset();
    coordinator.current = null;
  }, [configuredId, manualPageviews]);

  // A consented visit may start on a 404. Next Script runs once per layout, so
  // retry its guarded initializer after navigation to a known public page.
  useEffect(() => { window.quickvoiceStartAnalytics?.(); }, [pathname]);

  useEffect(() => {
    if (!manualPageviews) return;
    const measurementId = resolveGoogleAnalyticsId(configuredId, window.location.hostname);
    if (!measurementId) return;

    if (!coordinator.current) {
      coordinator.current = createPageviewCoordinator(measurementId, (parameters) => {
        // The bootstrap configures the destination before inserting this tag.
        // A delayed bootstrap must not lose the initial visit or send prematurely.
        if (window.quickvoiceAnalyticsConsent !== "granted" || !window.gtag || !document.getElementById("quickvoice-google-tag")) return false;
        window.gtag("event", "page_view", parameters);
        return true;
      }, {
        isActive: () => window.quickvoiceAnalyticsConsent === "granted" && window.quickvoiceAnalyticsPageAllowed?.() === true,
        isAllowed: (url) => window.quickvoiceAnalyticsPageAllowed?.(url) === true,
      });
    }
    const current = coordinator.current;
    // Read metadata after React's route commit, not at the history mutation.
    // Cleanup drops a pending callback when a navigation is superseded.
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      // Do not turn delayed bootstrap into a denied snapshot. onReady retries it.
      if (typeof window.quickvoiceAnalyticsPageAllowed !== "function") return;
      current.flush(); // Immediately discard pending visits on a privacy boundary.
      timer = window.setTimeout(() => {
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
    };
    recordCurrent.current = schedule;
    schedule();
    return () => {
      window.clearTimeout(timer);
      if (recordCurrent.current === schedule) recordCurrent.current = null;
    };
  }, [pathname, query, configuredId, manualPageviews]);

  return (
    <Script
      id="google-analytics"
      strategy="afterInteractive"
      onReady={() => {
        window.quickvoiceStartAnalytics?.();
        recordCurrent.current?.();
      }}
    >
      {script}
    </Script>
  );
}
