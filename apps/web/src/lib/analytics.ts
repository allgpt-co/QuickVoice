export type AnalyticsEventName =
  | "cta_click"
  | "oss_page_view"
  | "github_repo_click"
  | "docs_open"
  | "quickstart_copy";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | undefined
>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): boolean {
  if (typeof window === "undefined" || !window.gtag) return false;

  window.gtag("event", eventName, properties);
  return true;
}
