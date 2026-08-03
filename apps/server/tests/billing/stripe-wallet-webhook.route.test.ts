import assert from "node:assert/strict";
import { test } from "node:test";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { Server } from "node:http";
import Stripe from "stripe";

import {
  createStripeWalletWebhookHandler,
  stripeWalletWebhookRawBody,
} from "../../src/modules/billing/stripe-wallet-webhook.route.js";
import { requestJson } from "../helpers/http-client.js";

const secret = "whsec_wallet_route_test";
const stripe = new Stripe("sk_test_wallet_route_test", {
  apiVersion: "2026-06-24.dahlia",
});

test("a valid Stripe signature routes the untouched raw event body", async () => {
  const payload = eventPayload("evt_wallet_valid");
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  const processed: Stripe.Event[] = [];
  const handler = createStripeWalletWebhookHandler({
    isHostedBilling: () => true,
    getWebhookSecret: () => secret,
    constructEvent: (body, header, webhookSecret) => {
      assert.ok(Buffer.isBuffer(body));
      assert.equal(body.toString("utf8"), payload);
      return stripe.webhooks.constructEvent(body, header, webhookSecret);
    },
    processEvent: async (event) => {
      processed.push(event);
    },
  });

  const { server, baseUrl } = await startWebhookServer(handler);
  try {
    const response = await requestJson(
      `${baseUrl}/api/v1/billing/stripe/webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": signature,
        },
        body: payload,
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, received: true });
    assert.equal(processed.length, 1);
    assert.equal(processed[0]?.id, "evt_wallet_valid");
  } finally {
    await closeServer(server);
  }
});

test("missing or invalid signatures cannot reach wallet event processing", async () => {
  let processed = 0;
  const handler = createStripeWalletWebhookHandler({
    isHostedBilling: () => true,
    getWebhookSecret: () => secret,
    constructEvent: (body, header, webhookSecret) =>
      stripe.webhooks.constructEvent(body, header, webhookSecret),
    processEvent: async () => {
      processed += 1;
    },
  });
  const payload = eventPayload("evt_wallet_invalid");
  const { server, baseUrl } = await startWebhookServer(handler);
  try {
    const missing = await requestJson(
      `${baseUrl}/api/v1/billing/stripe/webhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      },
    );
    assert.equal(missing.status, 400);

    const invalid = await requestJson(
      `${baseUrl}/api/v1/billing/stripe/webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=invalid",
        },
        body: payload,
      },
    );
    assert.equal(invalid.status, 400);
    assert.equal(processed, 0);
  } finally {
    await closeServer(server);
  }
});

test("processing failures return 500 so Stripe retries the event", async () => {
  const payload = eventPayload("evt_wallet_retry");
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  const handler = createStripeWalletWebhookHandler({
    isHostedBilling: () => true,
    getWebhookSecret: () => secret,
    constructEvent: (body, header, webhookSecret) =>
      stripe.webhooks.constructEvent(body, header, webhookSecret),
    processEvent: async () => {
      throw new Error("database unavailable");
    },
  });
  const { server, baseUrl } = await startWebhookServer(handler);
  try {
    const response = await requestJson(
      `${baseUrl}/api/v1/billing/stripe/webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": signature,
        },
        body: payload,
      },
    );
    assert.equal(response.status, 500);
  } finally {
    await closeServer(server);
  }
});

test("the wallet webhook is inert in self-hosted mode", async () => {
  let secretReads = 0;
  let verificationCalls = 0;
  let processingCalls = 0;
  const handler = createStripeWalletWebhookHandler({
    isHostedBilling: () => false,
    getWebhookSecret: () => {
      secretReads += 1;
      return secret;
    },
    constructEvent: async () => {
      verificationCalls += 1;
      throw new Error("must not verify in self-hosted mode");
    },
    processEvent: async () => {
      processingCalls += 1;
    },
  });
  const { server, baseUrl } = await startWebhookServer(handler);
  try {
    const response = await requestJson(
      `${baseUrl}/api/v1/billing/stripe/webhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: eventPayload("evt_self_hosted"),
      },
    );
    assert.equal(response.status, 404);
    assert.equal(secretReads, 0);
    assert.equal(verificationCalls, 0);
    assert.equal(processingCalls, 0);
  } finally {
    await closeServer(server);
  }
});

function eventPayload(id: string) {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: Math.floor(Date.now() / 1_000),
    data: { object: { id: "cs_test", object: "checkout.session" } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  });
}

async function startWebhookServer(handler: express.RequestHandler) {
  const app = express();
  app.post(
    "/api/v1/billing/stripe/webhook",
    stripeWalletWebhookRawBody,
    handler,
  );
  app.use(express.json());
  app.use(
    (_error: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({ success: false });
    },
  );

  let server!: Server;
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
