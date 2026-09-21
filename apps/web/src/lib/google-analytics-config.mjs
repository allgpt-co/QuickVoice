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
export function createGoogleAnalyticsScript(configuredId = "", manualPageviews = false) {
  const measurementId = resolveGoogleAnalyticsId(configuredId);
  if (!measurementId) return null;

  return `(() => {
    if (window.quickvoiceAnalyticsConsent !== "granted") return;
    if (${!configuredId.trim()} && !["quickvoice.co", "www.quickvoice.co"].includes(window.location.hostname)) return;
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
    window.gtag("set", { allow_google_signals: false, allow_ad_personalization_signals: false });
    window.gtag("js", new Date());
    window.gtag("config", ${JSON.stringify(measurementId)}${manualPageviews ? ", { send_page_view: false }" : ""});
    const tag = document.createElement("script");
    tag.id = "quickvoice-google-tag";
    tag.async = true;
    tag.src = ${JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`)};
    document.head.appendChild(tag);
  })();`;
}
