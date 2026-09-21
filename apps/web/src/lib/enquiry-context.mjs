/**
 * Coarse, first-party enquiry context. No cookies, persistent storage, query
 * values, raw referrers, contact data, or cross-site visitor identifiers.
 * Context lasts only for this document/SPA visit. A full reload starts anew.
 * Browser observations are advisory, never proof of a lead's country or source.
 */
export const ENQUIRY_SOURCES = Object.freeze([
  "google", "bing", "duckduckgo", "github", "linkedin", "chatgpt",
  "perplexity", "referral", "direct", "unknown",
]);
export const ENQUIRY_MEDIA = Object.freeze([
  "organic", "paid", "referral", "ai_assistant", "direct", "unknown",
]);

/** @param {unknown} value */
export function publicLandingPath(value) {
  if (typeof value !== "string" || value.length > 2048) return "/other";
  const path = value.split(/[?#]/)[0];
  if (["/", "/blog", "/pricing", "/resources", "/open-source", "/solutions", "/industries", "/use-cases", "/company/contact", "/company/about-us"].includes(path)) return path;
  return /^\/(blog|solutions|industries|use-cases)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path) && path.length <= 180
    ? path.replace(/\/$/, "") : "/other";
}

/** @param {unknown} value */
export function submissionIdentifier(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : undefined;
}

/** @typedef {{landingPage: string, source: string, medium: string, method: "browser_observed"}} EnquiryContext */

/** Drop unknown keys and unsafe values on both sides of the browser boundary.
 * @param {unknown} value
 * @returns {EnquiryContext | undefined}
 */
export function normalizeEnquiryContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = /** @type {Record<string, unknown>} */ (value);
  if (data.method !== "browser_observed") return undefined;
  return {
    landingPage: publicLandingPath(data.landingPage),
    source: typeof data.source === "string" && ENQUIRY_SOURCES.includes(data.source) ? data.source : "unknown",
    medium: typeof data.medium === "string" && ENQUIRY_MEDIA.includes(data.medium) ? data.medium : "unknown",
    method: "browser_observed",
  };
}

/** @param {string} href @param {string} referrer @returns {EnquiryContext} */
export function observeEnquiryContext(href, referrer = "") {
  let location;
  try { location = new URL(href); } catch {
    return { landingPage: "/other", source: "unknown", medium: "unknown", method: "browser_observed" };
  }
  let source = "direct";
  let medium = "direct";
  try {
    const referral = new URL(referrer);
    const host = referral.hostname.toLowerCase().replace(/^www\./, "");
    if (referral.origin === location.origin || ["quickvoice.co", "app.quickvoice.co", "console.quickvoice.co", "docs.quickvoice.co"].includes(host)) {
      // A new document reached internally has no trustworthy original source.
      source = medium = "unknown";
    } else if (/^(google\.(com|co\.uk|co\.in|ca|com\.au)|bing\.com|duckduckgo\.com)$/.test(host)) {
      source = host.startsWith("google.") ? "google" : host.split(".")[0];
      medium = "organic";
    } else if (["chatgpt.com", "perplexity.ai"].includes(host)) {
      source = host.startsWith("chatgpt") ? "chatgpt" : "perplexity";
      medium = "ai_assistant";
    } else {
      source = ["github.com", "linkedin.com"].includes(host) ? host.split(".")[0] : "referral";
      medium = "referral";
    }
  } catch { /* Empty or withheld referrer is direct/unknown, not organic. */ }
  const query = location.searchParams;
  if (["gclid", "gbraid", "wbraid", "msclkid"].some((key) => query.has(key))) {
    source = query.has("msclkid") ? "bing" : "google";
    medium = "paid";
  } else if ([...query.keys()].some((key) => key.toLowerCase().startsWith("utm_"))) {
    // Do not store arbitrary UTM values or miscredit tagged ads/email to SEO.
    source = medium = "unknown";
  }
  return { landingPage: publicLandingPath(location.pathname), source, medium, method: "browser_observed" };
}

/** @type {EnquiryContext | undefined} */
let documentContext;

/** Capture only after analytics consent; declining clears the in-memory context. */
export function captureEnquiryContext() {
  if (typeof window === "undefined") return undefined;
  if (window.quickvoiceAnalyticsConsent !== "granted") {
    documentContext = undefined;
    return undefined;
  }
  documentContext ??= observeEnquiryContext(window.location.href, document.referrer);
  return { ...documentContext };
}
