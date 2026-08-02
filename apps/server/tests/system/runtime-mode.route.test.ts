import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";

import { requestJson } from "../helpers/http-client.js";

let server: Server;
let baseUrl: string;

before(async () => {
  process.env.QUICKVOICE_BILLING_MODE = "hosted";
  process.env.INTERNAL_API_KEY = "runtime-mode-test-secret";
  process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder";
  process.env.BETTER_AUTH_URL ||= "http://localhost:5000";
  process.env.BETTER_AUTH_SECRET ||= "test-secret-with-adequate-length-32chars";
  process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

  const [
    { default: runtimeRouter },
    { default: notFound },
    { default: errorHandler },
  ] = await Promise.all([
    import("../../src/modules/system/runtime.route.js"),
    import("../../src/middleware/notFound.middleware.js"),
    import("../../src/middleware/error.middleware.js"),
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/system", runtimeRouter);
  app.use(notFound);
  app.use(errorHandler);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("runtime mode is unavailable without the internal API key", async () => {
  const response = await requestJson(`${baseUrl}/api/v1/system/runtime-mode`);

  assert.equal(response.status, 401);
});

test("runtime mode reports the server billing mode to an internal caller", async () => {
  const response = await requestJson(`${baseUrl}/api/v1/system/runtime-mode`, {
    headers: {
      Authorization: "Bearer runtime-mode-test-secret",
    },
  });

  assert.equal(response.status, 200);
  const body = await response.json<{
    success: boolean;
    data: {
      service: string;
      runtimeProtocolVersion: number;
      billingMode: string;
    };
  }>();
  assert.deepEqual(body, {
    success: true,
    data: {
      service: "server",
      runtimeProtocolVersion: 1,
      billingMode: "hosted",
    },
  });
});
