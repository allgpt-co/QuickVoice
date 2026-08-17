import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { Server } from "node:http";

import {
  BLOCKED_LEGACY_SUBSCRIPTION_MUTATIONS,
  rejectLegacySubscriptionMutation,
} from "../../src/modules/billing/legacy-subscription.guard.js";
import { requestJson } from "../helpers/http-client.js";

test("only subscription upgrade, restore, and billing portal mutations are blocked", async () => {
  const app = express();
  app.post(
    BLOCKED_LEGACY_SUBSCRIPTION_MUTATIONS,
    rejectLegacySubscriptionMutation,
  );
  app.all("/*splat", (_req, res) => res.status(204).end());

  const { server, baseUrl } = await startServer(app);
  try {
    for (const path of BLOCKED_LEGACY_SUBSCRIPTION_MUTATIONS) {
      const response = await requestJson(`${baseUrl}${path}`, {
        method: "POST",
      });
      assert.equal(response.status, 409);
      const body = await response.json<{ code: string }>();
      assert.equal(body.code, "PREPAID_BILLING_REQUIRED");
    }

    const cancel = await requestJson(`${baseUrl}/subscription/cancel`, {
      method: "POST",
    });
    assert.equal(cancel.status, 204);

    const readOnlyMethod = await requestJson(`${baseUrl}/subscription/upgrade`);
    assert.equal(readOnlyMethod.status, 204);
  } finally {
    await closeServer(server);
  }
});

async function startServer(app: express.Express) {
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
