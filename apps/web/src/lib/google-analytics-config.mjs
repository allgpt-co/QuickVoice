export const QUICKVOICE_GA_MEASUREMENT_ID = "G-SZFBG11VRP";

/** The verified default belongs only to QuickVoice's public website. */
export function createGoogleAnalyticsScript(configuredId = "") {
  const override = configuredId.trim();
  if (override.toLowerCase() === "off") return null;

  const measurementId = override || QUICKVOICE_GA_MEASUREMENT_ID;
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
    throw new Error(
      "NEXT_PUBLIC_GA_MEASUREMENT_ID must be a GA4 G- ID or off.",
    );
  }

  return `(() => {
    if (${!override} && !["quickvoice.co", "www.quickvoice.co"].includes(window.location.hostname)) return;
    if (document.getElementById("quickvoice-google-tag")) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ${JSON.stringify(measurementId)});
    const tag = document.createElement("script");
    tag.id = "quickvoice-google-tag";
    tag.async = true;
    tag.src = ${JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`)};
    document.head.appendChild(tag);
  })();`;
}
