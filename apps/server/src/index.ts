import "dotenv/config";
import { createServer } from "node:http";
import { setTimeout as settle } from "node:timers/promises";
import path from "node:path";
import express, { Request } from "express";
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
import { closeRateLimitStore } from "./middleware/rate-limit-store.js";
import { trustedProxies } from "./config/trusted-proxies.js";
import { authClientIpMiddleware } from "./middleware/auth-client-ip.middleware.js";

import { serve as serveInngest } from "inngest/express";
import { inngest, getInngestServeOptions } from "./config/inngest.js";
import { inngestFunctions } from "./inngest/index.js";
import apiRouter from "./router.js";
import { createReadinessRouter } from "./modules/system/readiness.route.js";
import { getReadiness } from "./modules/system/readiness.service.js";
import systemRuntimeRouter from "./modules/system/runtime.route.js";
import contactRouter from "./modules/contact/contact.route.js";
import { publicWidgetOriginAllowed } from "./modules/widgets/widget.service.js";
import { createPublicWidgetCors } from "./modules/widgets/public-widget-cors.js";
import { closeKbWorker } from "./workers/kb.worker.js";
import { closeOutboundBatchWorker, startOutboundDispatchRecovery } from "./workers/outbound-batch.worker.js";
import { closeAgentDeletionWorker } from "./workers/agent-deletion.worker.js";
import { closeKbQueue } from "./queues/kb.queue.js";
import { closeOutboundBatchQueue } from "./queues/outbound-batch.queue.js";
import { closeAgentDeletionQueue } from "./queues/agent-deletion.queue.js";
import { closeRedisConnection } from "./config/redis.js";
import prisma from "./config/prisma.js";
import { armShutdownDeadline, closeResourcesInPhases } from "./workers/shutdown.js";
import apiDocsRouter from "./modules/system/api-docs.route.js";
import { LiveTranscriptGateway } from "./realtime/live-transcript.gateway.js";
import {
  stripeWalletWebhookHandler,
  stripeWalletWebhookRawBody,
} from "./modules/billing/stripe-wallet-webhook.route.js";
import {
  BLOCKED_LEGACY_SUBSCRIPTION_MUTATIONS,
  rejectLegacySubscriptionMutation,
} from "./modules/billing/legacy-subscription.guard.js";
import {
  startSilentCallWatchdog,
  stopSilentCallWatchdog,
} from "./modules/billing/silent-call-watchdog.service.js";
import {
  startAgentDeletionRecovery,
  stopAgentDeletionRecovery,
} from "./modules/agent/agent-deletion-recovery.service.js";

const app = express();
app.set("trust proxy", trustedProxies());
app.use(authClientIpMiddleware);

const port = process.env.PORT || 5000;
const apiVersion = process.env.API_VERSION || "v1";
const widgetAssetDir =
  process.env.WIDGET_ASSET_DIR ?? path.resolve(process.cwd(), "../widget/dist");

// Run widget CORS for every method, before console CORS, parsers and limits.
const publicWidgetPath = `/api/${apiVersion}/public/widgets`;
app.use(
  `${publicWidgetPath}/:widgetId`,
  createPublicWidgetCors(publicWidgetOriginAllowed),
);

/**
 * =========================
 * Global Middlewares
 * =========================
 */

// Security headers
app.use(helmet());

// Public widgets use their own origin allowlist, including on error responses.
const consoleCors = cors({
  origin: trustedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
  exposedHeaders: [
    "Retry-After",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset",
  ],
});
app.use((req, res, next) => {
  if (req.path.startsWith(`${publicWidgetPath}/`)) return next();
  return consoleCors(req, res, next);
});

// Request logger
app.use(
  morgan("dev", {
    skip: (req: Request) => req.method === "OPTIONS",
  }),
);

// Stripe signs the exact request bytes, so this endpoint must be mounted with
// a raw parser before Better Auth and the global JSON parser.
app.post(
  `/api/${apiVersion}/billing/stripe/webhook`,
  stripeWalletWebhookRawBody,
  stripeWalletWebhookHandler,
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

// Wallet billing replaces subscription mutations. Legacy list and cancel
// remain available while existing subscriptions are sunset.
app.post(
  BLOCKED_LEGACY_SUBSCRIPTION_MUTATIONS.map(
    (path) => `/api/${apiVersion}/auth${path}`,
  ),
  rejectLegacySubscriptionMutation,
);
app.all(`/api/${apiVersion}/auth/*splat`, toNodeHandler(auth));

// AI workers must verify billing-mode compatibility before registering with
// LiveKit. Mount this authenticated, read-only handshake before the public
// rate limiter so a shared worker egress IP cannot make deployments fail.
app.use(`/api/${apiVersion}/system`, systemRuntimeRouter);

// Rate limit before JSON parsing so oversized or abusive request bodies are
// throttled before the server spends work parsing them.
app.use(rateLimitMiddleware);

// The operational API specification is available only to authenticated users.
app.use(`/api/${apiVersion}`, apiDocsRouter);

// Authenticate contact forwarding before its bounded JSON parser. Keep this
// separate from session auth and mount it under the configured API version.
app.use(`/api/${apiVersion}`, contactRouter);

// Body parser (after Better Auth handler)
app.use(express.json());
// Inngest serve handler — exposes functions for remote invocation.
// Must be after express.json() so Inngest can read request bodies.
app.use(
  `/api/inngest`,
  serveInngest({ client: inngest, functions: inngestFunctions, ...getInngestServeOptions() }),
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

app.use(`/api/${apiVersion}/ready`, createReadinessRouter(getReadiness));

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

app.get(`/api/${apiVersion}/me`, authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Protected route access granted",
  });
});

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
  console.log(`Server listening on http://localhost:${port}`);
});

startSilentCallWatchdog();
startAgentDeletionRecovery();
void startOutboundDispatchRecovery().catch((error) => console.error("[outbound] recovery scheduler unavailable", error));

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  armShutdownDeadline();
  console.log(`[server] received ${signal}; shutting down`);
  stopSilentCallWatchdog();
  stopAgentDeletionRecovery();
  try {
    const serverClosing = (async () => {
      await liveTranscriptGateway.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
      }
    })();
    await closeResourcesInPhases([
      [
        closeKbWorker,
        closeOutboundBatchWorker,
        closeAgentDeletionWorker,
        () => serverClosing,
      ],
      // ponytail: a bounded grace period covers short post-response audit writes;
      // replace with tracked write draining if those tasks can exceed one second.
      [() => settle(1_000)],
      [
        closeKbQueue,
        closeOutboundBatchQueue,
        closeAgentDeletionQueue,
        closeRateLimitStore,
        closeRedisConnection,
        () => prisma.$disconnect(),
      ],
    ]);
    process.exitCode = 0;
  } catch (error) {
    console.error("[server] graceful shutdown failed", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
