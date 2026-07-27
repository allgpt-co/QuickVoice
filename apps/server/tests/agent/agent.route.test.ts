import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";

import { requestJson } from "../helpers/http-client.js";

let server: Server;
let baseUrl: string;

before(async () => {
  process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder";
  process.env.BETTER_AUTH_URL ||= "http://localhost:5000";
  process.env.BETTER_AUTH_SECRET ||= "test-secret-with-adequate-length-32chars";
  process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

  const [
    { default: agentRouter },
    { default: notFound },
    { default: errorHandler },
  ] = await Promise.all([
    import("../../src/modules/agent/agent.route.js"),
    import("../../src/middleware/notFound.middleware.js"),
    import("../../src/middleware/error.middleware.js"),
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/agents", agentRouter);
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

test("DELETE /:agentId is registered behind auth middleware", async () => {
  const response = await requestJson(
    `${baseUrl}/api/v1/agents/8d55565f-1111-4111-8111-f95fd03f0df2`,
    { method: "DELETE" },
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.code, "UNAUTHORIZED");
});
