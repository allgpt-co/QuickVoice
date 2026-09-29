import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { getBearerToken, matchesInternalApiKey } from "./auth.middleware.js";

export const publicRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // Temporary demo allowance per IP; replace with authenticated user limits.
  message: {
    success: false,
    message: "Too many requests, try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ponytail: budgets are per process; use a shared store when scaling API replicas.
export const internalCallbackRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 1000, // per worker IP, including retries and queued final reports
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
  const relativePath = path.startsWith(`${apiBasePath}/`)
    ? path.slice(apiBasePath.length)
    : "";
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
  const limiter =
    token && matchesInternalApiKey(token)
      ? internalCallbackRateLimitMiddleware
      : publicRateLimitMiddleware;
  return limiter(req, res, next);
};

export default rateLimitMiddleware;
