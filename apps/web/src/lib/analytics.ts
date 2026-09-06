export type AnalyticsEventName =
  | "cta_click"
  | "oss_page_view"
  | "github_repo_click"
  | "docs_open"
  | "generate_lead"
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

  try {
    window.gtag("event", eventName, properties);
    return true;
  } catch {
    return false;
  }
}

/** Count only acknowledged contact delivery; never send submitted form data. */
export function trackContactLead(formLocation: "homepage" | "contact_page"): boolean {
  return trackAnalyticsEvent("generate_lead", {
    method: "contact_form",
    form_location: formLocation,
    page_path: typeof window === "undefined" ? undefined : window.location.pathname,
  });
}
