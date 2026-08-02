import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { Server } from "node:http";

import { requestJson } from "../helpers/http-client.js";

process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder";
process.env.BETTER_AUTH_URL ||= "http://localhost:5000";
process.env.BETTER_AUTH_SECRET ||= "test-secret-with-adequate-length-32chars";
process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

let server: Server;
let baseUrl: string;
let calls: string[] = [];

const stage =
  (name: string): RequestHandler =>
  (_req: Request, _res: Response, next: NextFunction) => {
    calls.push(name);
    next();
  };

before(async () => {
  const { createPhoneRouter } =
    await import("../../src/modules/numbers/phone.route.js");
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/numbers",
    createPhoneRouter({
      authenticate: stage("auth"),
      authorizeCreate: stage("phone:create"),
      authorizeRead: stage("phone:read"),
      authorizeUpdate: stage("phone:update"),
      authorizeDelete: stage("phone:delete"),
      authorizeBillingManage: stage("billing:manage"),
      requireBillingManager: stage("owner-or-admin"),
      searchNumbers: (_req, res) => {
        calls.push("search-handler");
        res.status(200).json({ success: true, data: [] });
      },
      listNumbers: (_req, res) => {
        calls.push("list-handler");
        res.status(200).json({ success: true, data: [] });
      },
      buyNumber: (_req, res) => {
        calls.push("buy-handler");
        res.status(201).json({ success: true });
      },
      updateNumber: (_req, res) => {
        calls.push("update-handler");
        res.status(200).json({ success: true });
      },
      deleteNumber: (_req, res) => {
        calls.push("delete-handler");
        res.status(200).json({ success: true });
      },
    }),
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  calls = [];
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("purchase checks resource scope, billing scope, and built-in role in order", async () => {
  const response = await requestJson(`${baseUrl}/api/v1/numbers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "TWILIO",
      phoneNumber: "+14155550123",
      quoteId: "signed-quote",
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [
    "auth",
    "phone:create",
    "billing:manage",
    "owner-or-admin",
    "buy-handler",
  ]);
});

test("assignment checks resource scope, billing scope, and built-in role in order", async () => {
  const response = await requestJson(
    `${baseUrl}/api/v1/numbers/8d55565f-1111-4111-8111-f95fd03f0df2`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: null }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "auth",
    "phone:update",
    "billing:manage",
    "owner-or-admin",
    "update-handler",
  ]);
});

test("release checks resource scope, billing scope, and built-in role in order", async () => {
  const response = await requestJson(
    `${baseUrl}/api/v1/numbers/8d55565f-1111-4111-8111-f95fd03f0df2`,
    { method: "DELETE" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "auth",
    "phone:delete",
    "billing:manage",
    "owner-or-admin",
    "delete-handler",
  ]);
});

test("listing remains read-only and does not require billing management", async () => {
  const response = await requestJson(`${baseUrl}/api/v1/numbers`);

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["auth", "phone:read", "list-handler"]);
});
