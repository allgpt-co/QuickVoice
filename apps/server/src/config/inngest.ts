import { Inngest } from "inngest";
import { serverBaseUrl } from "./origins.js";

export const inngest = new Inngest({ id: "quickvoice" });

// Registration must not depend on Host/X-Forwarded-Proto or proxy trust changes.
export function getInngestServeOptions(
  origin = process.env.INNGEST_SERVE_ORIGIN || process.env.INNGEST_SERVE_HOST || serverBaseUrl,
  servePath = process.env.INNGEST_SERVE_PATH || "/api/inngest",
) {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Inngest serve origin must be an HTTP(S) URL without credentials");
  }
  if (!servePath.startsWith("/") || servePath.startsWith("//") || /[?#\\\s]/.test(servePath)) {
    throw new Error("INNGEST_SERVE_PATH must be an absolute URL path without query or fragment");
  }
  return { serveOrigin: url.origin, servePath };
}
