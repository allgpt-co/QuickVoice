import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import authMiddleware, { getBearerToken, matchesInternalApiKey } from "./auth.middleware.js";
import { rateLimitStore } from "./rate-limit-store.js";

export const publicRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // Anonymous traffic only; authenticated traffic uses its own allowance.
  store: rateLimitStore("public"),
  message: {
    success: false,
    message: "Too many requests, try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authenticatedRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  store: rateLimitStore("authenticated"),
  keyGenerator: (req) => {
    if (!req.auth || req.auth.authMethod === "internal") {
      throw new Error("Authenticated rate limit requires a verified session or API key");
    }
    return req.auth.authMethod === "apiKey"
      ? `api-key:${req.auth.apiKeyId}`
      : `user:${req.auth.userId}`;
  },
  message: { success: false, code: "RATE_LIMITED", message: "Too many requests. Please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const internalCallbackRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 1000, // per worker IP, including retries and queued final reports
  store: rateLimitStore("internal"),
  message: {
    success: false,
    message: "Too many internal requests, try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiBasePath = `/api/${process.env.API_VERSION || "v1"}`.toLowerCase();

const rateLimitMiddleware: RequestHandler = (req, res, next) => {
  const path = req.path.toLowerCase();
  // Inngest authenticates callbacks with its signing key and must be able to
  // deliver billing/reconciliation steps even when public traffic is limited.
  if (/^\/api\/inngest\/?$/.test(path)) return next();

  const relativePath = path.startsWith(`${apiBasePath}/`)
    ? path.slice(apiBasePath.length)
    : "";
  if ((req.method === "GET" || req.method === "HEAD") && /^\/(?:health|ready)\/?$/.test(relativePath)) {
    return next();
  }
  const isAiCallback =
    (req.method === "GET" &&
      /^\/agents\/(?:internal-config|number-config)\/[^/]+\/?$/.test(
        relativePath,
      )) ||
    (req.method === "POST" &&
      /^\/(?:billing\/calls\/usage|calls)\/?$/.test(relativePath));
  const token = isAiCallback ? getBearerToken(req.headers.authorization) : null;

  // Only verified AI callbacks get their own bounded allowance. Route auth
  // still runs afterward, including organization/user and payload validation.
  if (token && matchesInternalApiKey(token)) {
    return internalCallbackRateLimitMiddleware(req, res, next);
  }

  // A cookie/key's mere presence grants nothing. Only successful authentication
  // selects a user bucket; forged headers still consume the anonymous allowance.
  if (req.headers.cookie || req.headers["x-api-key"]) {
    return authMiddleware(req, res, (error) => {
      if (error || !req.auth || req.auth.authMethod === "internal") {
        return publicRateLimitMiddleware(req, res, next);
      }
      return authenticatedRateLimitMiddleware(req, res, next);
    });
  }
  return publicRateLimitMiddleware(req, res, next);
};

export default rateLimitMiddleware;
