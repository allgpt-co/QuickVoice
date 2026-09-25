import type { RequestHandler, Response } from "express";
import { ForbiddenError } from "../../common/errors/forbidden.js";

export function createPublicWidgetCors(
  originAllowed: (
    widgetId: string,
    origin: string | undefined,
  ) => Promise<boolean>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      // Apply before parsers and rate limits so allowed sites can read errors.
      res.removeHeader("Access-Control-Allow-Origin");
      res.vary("Origin");
      const origin = req.headers.origin;
      const allowed =
        typeof req.params.widgetId === "string" &&
        (await originAllowed(req.params.widgetId, origin));
      if (allowed && origin) setPublicWidgetCorsHeaders(res, origin);
      if (req.method === "OPTIONS") {
        res.status(allowed ? 204 : 403).end();
        return;
      }
      if (origin && !allowed) {
        throw new ForbiddenError("Origin is not allowed for this widget");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function setPublicWidgetCorsHeaders(res: Response, origin: string) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.vary("Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Requested-With, X-API-Key, Authorization, X-Request-ID",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "600");
}
