import "dotenv/config";
import { createServer } from "node:http";
import path from "node:path";
import express, { Request, type RequestHandler } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { trustedOrigins } from "./config/origins.js";

import authMiddleware from "./middleware/auth.middleware.js";
import notFound from "./middleware/notFound.middleware.js";
import errorHandler from "./middleware/error.middleware.js";
import rateLimitMiddleware from "./middleware/rateLimit.middleware.js";

import { serve as serveInngest } from "inngest/express";
import { inngest } from "./config/inngest.js";
import { inngestFunctions } from "./inngest/index.js";
import apiRouter from "./router.js";
import { getReadiness } from "./modules/system/readiness.service.js";
import { publicWidgetOriginAllowed } from "./modules/widgets/widget.service.js";
import "./workers/kb.worker.js";
import "./workers/outbound-batch.worker.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import { LiveTranscriptGateway } from "./realtime/live-transcript.gateway.js";

const app = express();

const port = process.env.PORT || 5000;
const apiVersion = process.env.API_VERSION || "v1";
const widgetAssetDir =
  process.env.WIDGET_ASSET_DIR ?? path.resolve(process.cwd(), "../widget/dist");


app.get(`/api/${apiVersion}/docs.json`, (_req, res) => {
  res.json(swaggerSpec);
});

app.use(
  `/api/${apiVersion}/docs`,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: false,
      withCredentials: true,
    },
  })
);

const publicWidgetPreflight: RequestHandler<{ widgetId: string }> = async (
  req,
  res,
  next
) => {
  try {
    const origin = req.headers.origin;
    const allowed = await publicWidgetOriginAllowed(
      req.params.widgetId,
      origin
    );
    if (allowed && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Requested-With"
      );
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.status(allowed ? 204 : 403).end();
  } catch (error) {
    next(error);
  }
};

// Public widget preflights must run before global console CORS, otherwise the
// generic CORS middleware terminates customer-site OPTIONS requests without
// the widget-specific origin allowlist headers.
app.options(
  `/api/${apiVersion}/public/widgets/:widgetId/config`,
  publicWidgetPreflight
);
app.options(
  `/api/${apiVersion}/public/widgets/:widgetId/sessions`,
  publicWidgetPreflight
);
app.options(
  `/api/${apiVersion}/public/widgets/:widgetId/sessions/:sessionId/end`,
  publicWidgetPreflight
);

/**
 * =========================
 * Global Middlewares
 * =========================
 */

// Security headers — disable helmet's cross-origin policies that conflict
// with our CORS setup (crossOriginResourcePolicy: same-origin blocks the
// Access-Control-Allow-Origin header from being respected by browsers).
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  })
);

// ─── CORS ───────────────────────────────────────────────────────────────────
// Hand-rolled middleware runs first so it isn't blocked by either:
//  • the cors package's own OPTIONS short-circuit, or
//  • Better Auth's toNodeHandler intercepting OPTIONS on auth routes.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && trustedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Cookie"
    );
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Max-Age", "600");
      res.status(204).end();
      return;
    }
  }
  next();
});

// Request logger
app.use(
  morgan("dev", {
    skip: (req: Request) => req.method === "OPTIONS",
  })
);

/**
 * =========================
 * Auth Routes
 * =========================
 *
 * Better Auth handler MUST be mounted BEFORE express.json() — otherwise
 * client API requests get stuck in a pending state.
 * See: https://better-auth.com/docs/integrations/express
 */
app.all(`/api/${apiVersion}/auth/*splat`, toNodeHandler(auth));

// Rate limit before JSON parsing so oversized or abusive request bodies are
// throttled before the server spends work parsing them.
app.use(rateLimitMiddleware);

// Body parser (after Better Auth handler)
app.use(express.json());
// Inngest serve handler — exposes functions for remote invocation.
// Must be after express.json() so Inngest can read request bodies.
app.use(
  `/api/inngest`,
  serveInngest({ client: inngest, functions: inngestFunctions })
);
/**
 * =========================
 * Public Routes
 * =========================
 */

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.get(`/api/${apiVersion}/health`, (req, res) => {
  res.json({
    success: true,
    message: "Server running fine",
  });
});

app.get(`/api/${apiVersion}/ready`, async (_req, res, next) => {
  try {
    const readiness = await getReadiness();
    res.status(readiness.ready ? 200 : 503).json({
      success: readiness.ready,
      message: readiness.ready ? "Server ready" : "Server not ready",
      data: readiness,
    });
  } catch (error) {
    next(error);
  }
});

app.use(
  "/widget/v1",
  express.static(widgetAssetDir, {
    immutable: true,
    maxAge: "1h",
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

/**
 * =========================
 * Protected Routes Example
 * =========================
 */

app.get(
  `/api/${apiVersion}/me`,
  authMiddleware,
  (req, res) => {
    res.json({
      success: true,
      message: "Protected route access granted",
    });
  }
);

/**
 * =========================
 * Module Routes
 * =========================
 */

app.use(`/api/${apiVersion}`, apiRouter);



/**
 * =========================
 * 404 + Error Handler
 * =========================
 */

app.use(notFound);
app.use(errorHandler);

/**
 * =========================
 * Start Server
 * =========================
 */

const httpServer = createServer(app);
const liveTranscriptGateway = new LiveTranscriptGateway(httpServer);

void liveTranscriptGateway.start().catch((error) => {
  console.warn("[live-transcript] failed to start Redis subscriber", {
    error: error instanceof Error ? error.message : String(error),
  });
});

httpServer.listen(port, () => {
  console.log(
    `Server listening on http://localhost:${port}`
  );
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}; shutting down`);
  try {
    await liveTranscriptGateway.close();
    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    process.exitCode = 0;
  } catch (error) {
    console.error("[server] graceful shutdown failed", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
