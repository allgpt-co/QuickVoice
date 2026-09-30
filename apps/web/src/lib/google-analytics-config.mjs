import { STATIC_ANALYTICS_PATHS } from "./analytics-public-routes.mjs";

export const QUICKVOICE_GA_MEASUREMENT_ID = "G-SZFBG11VRP";

/** Only an explicit opt-in may replace GA's automatic pageview measurement. */
export function manualPageviewsEnabled(value = "") {
  return value.trim().toLowerCase() === "true";
}

/**
 * Omit hostname only for server-side configuration validation.
 * @param {string} configuredId
 * @param {string | null} hostname
 */
export function resolveGoogleAnalyticsId(configuredId = "", hostname = null) {
  const override = configuredId.trim();
  if (override.toLowerCase() === "off") return null;

  const measurementId = override || QUICKVOICE_GA_MEASUREMENT_ID;
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
    throw new Error(
      "NEXT_PUBLIC_GA_MEASUREMENT_ID must be a GA4 G- ID or off.",
    );
  }
  if (
    !override && hostname !== null &&
    !["quickvoice.co", "www.quickvoice.co"].includes(hostname)
  ) return null;
  return measurementId;
}

/** The verified default belongs only to QuickVoice's public website. */
export function createGoogleAnalyticsScript(configuredId = "", manualPageviews = false, publicPaths = STATIC_ANALYTICS_PATHS) {
  const measurementId = resolveGoogleAnalyticsId(configuredId);
  if (!measurementId) return null;

  return `(() => {
    const publicPaths = new Set(${JSON.stringify(publicPaths)});
    window.quickvoiceStartAnalytics = () => {
      if (window.quickvoiceAnalyticsConsent !== "granted") return;
      if (${!configuredId.trim()} && !["quickvoice.co", "www.quickvoice.co"].includes(window.location.hostname)) return;
      // Consent alone must not load the tag on a private route or an unknown 404.
      const pathname = window.location.pathname.replace(/\\/$/, "") || "/";
      if (!publicPaths.has(pathname)) return;
      if (document.getElementById("quickvoice-google-tag")) return;
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.quickvoiceAnalyticsMeasurementId = ${JSON.stringify(measurementId)};
      window[${JSON.stringify(`ga-disable-${measurementId}`)}] = false;
      window.gtag("consent", "default", {
        analytics_storage: "denied", ad_storage: "denied",
        ad_user_data: "denied", ad_personalization: "denied"
      });
      window.gtag("consent", "update", { analytics_storage: "granted" });
      // Keep the referral source without forwarding arbitrary path/query values.
      // Set this before config: automatic initial views and custom events inherit it.
      let pageReferrer = "";
      try {
        const referrer = new URL(document.referrer);
        if (["http:", "https:"].includes(referrer.protocol)) pageReferrer = referrer.origin;
      } catch { /* Direct visits and malformed referrers have no referral source. */ }
      window.gtag("set", {
        allow_google_signals: false, allow_ad_personalization_signals: false,
        page_referrer: pageReferrer
      });
      window.gtag("js", new Date());
      window.gtag("config", ${JSON.stringify(measurementId)}${manualPageviews ? ", { send_page_view: false }" : ""});
      const tag = document.createElement("script");
      tag.id = "quickvoice-google-tag";
      tag.async = true;
      tag.src = ${JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`)};
      document.head.appendChild(tag);
    };
    window.quickvoiceStartAnalytics();
  })();`;
}
