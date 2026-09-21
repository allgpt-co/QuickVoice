export const CONSENT_KEY = "quickvoice.analytics-consent.v1";

export function normalizeConsent(value) {
  return value === "granted" || value === "denied" ? value : "unknown";
}

export function readConsent(browser) {
  try { return normalizeConsent(browser.localStorage.getItem(CONSENT_KEY)); }
  catch { return "unknown"; }
}

/** Preference only: no identifiers, contact fields or browsing history. */
export function applyConsent(browser, choice) {
  const value = normalizeConsent(choice);
  browser.quickvoiceAnalyticsConsent = value;
  const measurementId = browser.quickvoiceAnalyticsMeasurementId;
  if (measurementId) {
    // Disable collection before revoking consent, including automatic history views.
    browser[`ga-disable-${measurementId}`] = value !== "granted";
    browser.gtag?.("consent", "update", {
      analytics_storage: value === "granted" ? "granted" : "denied",
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    });
  }
  if (value !== "granted") {
    const host = browser.location.hostname;
    const domains = ["", host, `.${host}`];
    if (host === "quickvoice.co" || host.endsWith(".quickvoice.co")) domains.push(".quickvoice.co");
    for (const cookie of browser.document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (!/^(_ga($|_)|_gid$|_gat($|_))/.test(name)) continue;
      for (const domain of domains) {
        browser.document.cookie = `${name}=; Max-Age=0; Path=/;${domain ? ` Domain=${domain};` : ""} SameSite=Lax`;
      }
    }
  }
  return value;
}

const listeners = new Set();
let initialized = false;

export function getConsentSnapshot() {
  return typeof window === "undefined" ? "unknown" : normalizeConsent(window.quickvoiceAnalyticsConsent);
}
export function getServerConsentSnapshot() { return "unknown"; }

export function subscribeConsent(listener) {
  if (!initialized) {
    initialized = true;
    applyConsent(window, readConsent(window));
    window.addEventListener("storage", (event) => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      applyConsent(window, readConsent(window));
      for (const notify of listeners) notify();
    });
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function saveConsent(choice) {
  const value = applyConsent(window, choice);
  try { window.localStorage.setItem(CONSENT_KEY, value); }
  catch { /* The choice still applies in this tab; next visit defaults off. */ }
  for (const notify of listeners) notify();
}
