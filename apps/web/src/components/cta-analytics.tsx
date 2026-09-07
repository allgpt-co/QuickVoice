"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent, type AnalyticsEventName } from "@/lib/analytics";
import {
  analyticsDestination,
  matchesAnalyticsDestination,
} from "@/lib/cta-destinations.mjs";
import {
  CONTACT_URL,
  DEMO_BOOKING_URL,
  GITHUB_DOCS_URL,
  GITHUB_REPO_URL,
  LOGIN_URL,
  REGISTER_URL,
} from "@/lib/links";

const CTA_DESTINATIONS = [
  { type: "contact", href: CONTACT_URL },
  { type: "demo", href: DEMO_BOOKING_URL },
  { type: "login", href: LOGIN_URL },
  { type: "signup", href: REGISTER_URL },
] as const;

const ACTION_DESTINATIONS: ReadonlyArray<{
  eventName: AnalyticsEventName;
  href: string;
}> = [
  { eventName: "github_repo_click", href: GITHUB_REPO_URL },
  { eventName: "docs_open", href: GITHUB_DOCS_URL },
];

function getCtaType(rawHref: string): string | null {
  for (const destination of CTA_DESTINATIONS) {
    if (
      matchesAnalyticsDestination(
        rawHref,
        destination.href,
        window.location.origin,
      )
    ) {
      return destination.type;
    }
  }

  return null;
}

function getActionEvent(rawHref: string): AnalyticsEventName | null {
  for (const destination of ACTION_DESTINATIONS) {
    if (
      matchesAnalyticsDestination(
        rawHref,
        destination.href,
        window.location.origin,
      )
    ) {
      return destination.eventName;
    }
  }

  return null;
}

export function CtaAnalytics() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!window.gtag || !(event.target instanceof Element)) return;

      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      const href = link?.getAttribute("href");
      if (!link || !href) return;

      const linkText = link.textContent
        ?.replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      const linkDestination = analyticsDestination(
        href,
        window.location.origin,
      );
      if (!linkDestination) return;
      const linkLocation = link.dataset.analyticsLocation;
      const ctaType = getCtaType(href);
      if (ctaType) {
        trackAnalyticsEvent("cta_click", {
          cta_type: ctaType,
          cta_destination: linkDestination,
          link_text: linkText,
          link_location: linkLocation,
          page_path: window.location.pathname,
        });
      }

      const actionEvent = getActionEvent(href);
      if (actionEvent) {
        trackAnalyticsEvent(actionEvent, {
          link_destination: linkDestination,
          link_text: linkText,
          link_location: linkLocation,
          page_path: window.location.pathname,
        });
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
