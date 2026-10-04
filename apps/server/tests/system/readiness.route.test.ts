import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import { createReadinessRouter } from "../../src/modules/system/readiness.route.js";
import { requestJson } from "../helpers/http-client.js";

const internalApiKey = process.env.INTERNAL_API_KEY;

before(() => {
  process.env.INTERNAL_API_KEY = "readiness-test-internal-key";
});

after(() => {
  if (internalApiKey === undefined) delete process.env.INTERNAL_API_KEY;
  else process.env.INTERNAL_API_KEY = internalApiKey;
});

async function startServer() {
  const readiness = {
    ready: false,
    requiredIntegrations: ["db"],
    unknownRequiredIntegrations: [],
    checks: {
      db: {
        status: "error" as const,
        message: "Database connectivity check failed",
      },
      stripe: {
        status: "not_configured" as const,
        message: "Stripe is missing",
      },
    },
  };
  const app = express();
  app.use(
    "/api/v1/ready",
    createReadinessRouter(async () => readiness),
  );
  app.use(
    (
      error: { statusCode?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(error.statusCode ?? 500).json({ success: false });
    },
  );
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer),
    );
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind");
  return { server, baseUrl: `http://127.0.0.1:${address.port}/api/v1/ready` };
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("public readiness omits per-integration status and errors", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => closeServer(server));

  const response = await requestJson(baseUrl);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    success: false,
    message: "Server not ready",
  });
});

test("detailed readiness requires the internal API key", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => closeServer(server));

  assert.equal((await requestJson(`${baseUrl}/details`)).status, 401);

  const response = await requestJson(`${baseUrl}/details`, {
    headers: { Authorization: "Bearer readiness-test-internal-key" },
  });
  assert.equal(response.status, 503);
  const body = (await response.json()) as { data?: { checks?: unknown } };
  assert.ok(body.data?.checks);
});
