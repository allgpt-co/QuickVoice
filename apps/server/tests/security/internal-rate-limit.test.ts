import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import type { Server } from "node:http";
import express from "express";

import { requestJson } from "../helpers/http-client.js";

const originalEnv = { ...process.env };
const internalKey = "rate-limit-test-internal-key";
const internalHeaders = {
  authorization: `Bearer ${internalKey}`,
  "x-user-id": "test-user",
  "x-organization-id": "test-org",
};
const callbacks = [
  { method: "GET", path: "/agents/internal-config/test-agent" },
  { method: "GET", path: "/agents/number-config/%2B15555550100" },
  { method: "POST", path: "/billing/calls/usage" },
  { method: "POST", path: "/calls" },
];
let server: Server;
let baseUrl: string;
let limits: typeof import("../../src/middleware/rateLimit.middleware.js");
let sessionLookups = 0;
const officeUsers = Array.from({ length: 80 }, (_, index) => `office-user-${index}`);
let restorePrisma = () => {};

before(async () => {
  process.env.API_VERSION = "rate-limit-test";
  process.env.RATE_LIMIT_STORE = "memory";
  process.env.DATABASE_URL =
    "postgresql://test:test@127.0.0.1:1/quickvoice-test";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.BETTER_AUTH_URL = "http://localhost:5000";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-adequate-length-32chars";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  limits = await import("../../src/middleware/rateLimit.middleware.js");
  const { default: authMiddleware, requireInternalApiKey } =
    await import("../../src/middleware/auth.middleware.js");
  const { default: errorMiddleware } =
    await import("../../src/middleware/error.middleware.js");
  const { auth } = await import("../../src/lib/auth.js");
  const { default: prisma } = await import("../../src/config/prisma.js");
  mock.method(auth.api, "getSession", async ({ headers }: { headers: Headers }) => {
    sessionLookups++;
    const cookie = headers.get("cookie");
    const userId = cookie === "session=alice" || cookie === "session=alice-other-device"
      ? "alice" : cookie === "session=bob" ? "bob"
        : officeUsers.find((id) => cookie === `session=${id}`) ?? null;
    return userId ? { user: { id: userId }, session: { activeOrganizationId: "org" } } : null;
  });
  mock.method(auth.api, "verifyApiKey", async ({ body }: { body: { key: string } }) => (
    ["key-a", "key-b"].includes(body.key)
      ? { valid: true, key: { id: body.key, referenceId: "org", permissions: { callLogs: ["read"] } } }
      : { valid: false }
  ));
  const findMember = prisma.member.findFirst;
  const executeRaw = prisma.$executeRaw;
  prisma.member.findFirst = (async () => ({ userId: "alice" })) as typeof findMember;
  prisma.$executeRaw = (async () => 1) as typeof executeRaw;
  restorePrisma = () => {
    prisma.member.findFirst = findMember;
    prisma.$executeRaw = executeRaw;
  };

  const app = express();
  // Exercise the production ordering and auth without invoking live providers.
  app.use(limits.default);
  app.use(express.json());
  app.all("/api/inngest", (_req, res) => res.sendStatus(204));
  const router = express.Router();
  router.get("/public-test", (_req, res) => res.sendStatus(204));
  router.get(["/health", "/ready"], (_req, res) => res.sendStatus(204));
  router.get(["/protected", "/calls/live"], authMiddleware, (req, res) => res.json({ userId: req.auth?.userId }));
  router.get(
    ["/agents/internal-config/:agentId", "/agents/number-config/:phoneNumber"],
    requireInternalApiKey,
    (_req, res) => res.sendStatus(204),
  );
  router.post(
    ["/billing/calls/usage", "/calls"],
    authMiddleware,
    (req, res) => {
      assert.equal(req.auth?.authMethod, "internal");
      assert.equal(req.auth?.activeOrganizationId, "test-org");
      res.sendStatus(204);
    },
  );
  app.use("/api/rate-limit-test", router);
  app.use(errorMiddleware);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/rate-limit-test`;
});

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = internalKey;
  await limits.publicRateLimitMiddleware.resetKey("127.0.0.1");
  await limits.internalCallbackRateLimitMiddleware.resetKey("127.0.0.1");
  for (const key of ["user:alice", "user:bob", "api-key:key-a", "api-key:key-b", ...officeUsers.map((id) => `user:${id}`)]) {
    await limits.authenticatedRateLimitMiddleware.resetKey(key);
  }
  sessionLookups = 0;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  process.env = originalEnv;
  restorePrisma();
  mock.restoreAll();
});

async function exhaustPublicAllowance(
  path = "/public-test",
  headers: Record<string, string> = {},
  initialStatus = 204,
) {
  for (let i = 0; i < 1000; i++) {
    const response = await requestJson(`${baseUrl}${path}`, { headers });
    assert.equal(response.status, initialStatus, `request ${i + 1}`);
  }
  const response = await requestJson(`${baseUrl}${path}`, { headers });
  assert.equal(response.status, 429);
  assert.equal(response.headers["ratelimit-limit"], "1000");
  assert.ok(Number(response.headers["retry-after"]) <= 60);
}

test("one user's quota cannot block another user, anonymous traffic, or AI callbacks on the same IP", async () => {
  for (let i = 0; i < 300; i++) {
    const response = await requestJson(`${baseUrl}/protected`, { headers: { cookie: "session=alice" } });
    assert.equal(response.status, 200);
  }
  assert.equal(sessionLookups, 300, "route auth reuses the verified identity");
  const blocked = await requestJson(`${baseUrl}/protected`, {
    headers: { cookie: "session=alice-other-device", "x-user-id": "bob", "x-organization-id": "other-org" },
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers["ratelimit-limit"], "300");
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
  assert.ok(Number(blocked.headers["retry-after"]) <= 60);
  assert.equal((await requestJson(`${baseUrl}/protected`, { headers: { cookie: "session=bob" } })).status, 200);
  assert.equal((await requestJson(`${baseUrl}/public-test`)).status, 204);
  assert.equal((await requestJson(`${baseUrl}${callbacks[0]!.path}`, { headers: internalHeaders })).status, 204);
});

test("office users polling live calls share an IP but never share their request budgets", async () => {
  // All 1,200 requests come from the same socket IP within one minute. This
  // exceeds even the anonymous allowance without exhausting any user's quota.
  for (let poll = 1; poll <= 15; poll++) {
    for (const userId of officeUsers) {
      const response = await requestJson(`${baseUrl}/calls/live`, {
        headers: { cookie: `session=${userId}` },
      });
      assert.equal(response.status, 200, `${userId}, poll ${poll}`);
      assert.equal((await response.json()).userId, userId);
      assert.equal(response.headers["ratelimit-limit"], "300");
      assert.equal(response.headers["ratelimit-remaining"], String(300 - poll));
    }
  }
  assert.equal(sessionLookups, 1200, "one authentication lookup per request");
  const anonymous = await requestJson(`${baseUrl}/public-test`);
  assert.equal(anonymous.status, 204);
  assert.equal(anonymous.headers["ratelimit-remaining"], "999", "console polling never spends the NAT's anonymous quota");
});

test("API key quotas use verified key IDs separately from the owner's browser session", async () => {
  for (let i = 0; i < 300; i++) {
    assert.equal((await requestJson(`${baseUrl}/protected`, { headers: { "x-api-key": "key-a" } })).status, 200);
  }
  assert.equal((await requestJson(`${baseUrl}/protected`, { headers: { "x-api-key": "key-a", "x-user-id": "bob" } })).status, 429);
  assert.equal((await requestJson(`${baseUrl}/protected`, { headers: { "x-api-key": "key-b" } })).status, 200);
  assert.equal((await requestJson(`${baseUrl}/protected`, { headers: { cookie: "session=alice" } })).status, 200);
});

test("exhausted anonymous quota cannot block verified users or health probes; forged identities cannot bypass it", async () => {
  await exhaustPublicAllowance();
  for (const path of ["/health", "/ready", "/HEALTH/?probe=1"]) {
    assert.equal((await requestJson(`${baseUrl}${path}`)).status, 204);
    assert.equal((await requestJson(`${baseUrl}${path}`, { method: "HEAD" })).status, 204);
  }
  assert.equal((await requestJson(`${baseUrl}/health/extra`)).status, 429);
  for (const headers of [
    { "x-user-id": "alice" }, { cookie: "session=forged" }, { "x-api-key": "forged" },
  ]) {
    assert.equal((await requestJson(`${baseUrl}/protected`, { headers })).status, 429);
  }
  assert.equal((await requestJson(`${baseUrl}/protected`, { headers: { cookie: "session=alice" } })).status, 200);
});

test("health probes do not consume anonymous quota", async () => {
  for (let i = 0; i < 1001; i++) {
    assert.equal((await requestJson(`${baseUrl}/health`)).status, 204);
  }
  await exhaustPublicAllowance();
});

test("Inngest callbacks bypass an exhausted public bucket without exempting lookalike paths", async () => {
  await exhaustPublicAllowance();
  const origin = new URL(baseUrl).origin;

  for (const method of ["GET", "POST", "PUT"]) {
    const response = await requestJson(`${origin}/api/inngest`, { method });
    assert.equal(response.status, 204, method);
  }
  assert.equal((await requestJson(`${origin}/api/inngest/other`)).status, 429);
});

test("AI callbacks exceed 100 requests without consuming the shared IP's public allowance", async () => {
  for (let i = 0; i < 104; i++) {
    const callback = callbacks[i % callbacks.length]!;
    const response = await requestJson(`${baseUrl}${callback.path}`, {
      method: callback.method,
      headers: internalHeaders,
    });
    assert.equal(response.status, 204, `${callback.method} ${callback.path}`);
  }
  await exhaustPublicAllowance();
});

test("internal callbacks still work when the public IP allowance is exhausted", async () => {
  await exhaustPublicAllowance();
  for (const callback of callbacks) {
    const response = await requestJson(`${baseUrl}${callback.path}`, {
      method: callback.method,
      headers: internalHeaders,
    });
    assert.equal(response.status, 204);
    const unauthorized = await requestJson(`${baseUrl}${callback.path}`, {
      method: callback.method,
      headers: { authorization: "Bearer incorrect-key" },
    });
    assert.equal(unauthorized.status, 429);
  }
  // Express accepts these forms, which must use the same callback allowance.
  const response = await requestJson(
    `${baseUrl}/AGENTS/INTERNAL-CONFIG/test-agent/?check=1`,
    {
      headers: { authorization: `bEaReR ${internalKey}` },
    },
  );
  assert.equal(response.status, 204);
});

test("verified callbacks retain a separate 1000-per-minute cap", async () => {
  for (let i = 0; i < 1000; i++) {
    const response = await requestJson(`${baseUrl}${callbacks[0]!.path}`, {
      headers: internalHeaders,
    });
    assert.equal(response.status, 204, `internal request ${i + 1}`);
  }
  const response = await requestJson(`${baseUrl}${callbacks[1]!.path}`, {
    headers: internalHeaders,
  });
  assert.equal(response.status, 429);
  assert.match((await response.json()).message, /Too many internal requests/);
  await exhaustPublicAllowance();
});

for (const authorization of [
  undefined,
  `Bearer ${"x".repeat(internalKey.length)}`,
  "Bearer incorrect-key",
  "Bearer",
  `Basic ${internalKey}`,
]) {
  test(`unverified callback authorization remains rate limited: ${authorization ?? "missing"}`, async () => {
    await exhaustPublicAllowance(
      callbacks[0]!.path,
      authorization ? { authorization } : {},
      401,
    );
  });
}

test("an unset or empty server key cannot grant the internal allowance", async () => {
  for (const expected of [undefined, "", "   "]) {
    if (expected === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = expected;
    await limits.publicRateLimitMiddleware.resetKey("127.0.0.1");
    await exhaustPublicAllowance(callbacks[0]!.path, internalHeaders, 401);
  }
});

test("the internal key does not increase the allowance for other routes or methods", async () => {
  await exhaustPublicAllowance("/public-test", internalHeaders);
  for (const [method, path] of [
    ["GET", "/calls"],
    ["GET", "/billing/calls/usage"],
    ["POST", callbacks[0]!.path],
    ["GET", `${callbacks[0]!.path}/extra`],
  ]) {
    const response = await requestJson(`${baseUrl}${path}`, {
      method,
      headers: internalHeaders,
    });
    assert.equal(response.status, 429, `${method} ${path}`);
  }
});

test("the internal allowance preserves identity checks and JSON validation", async () => {
  const missingIdentity = await requestJson(`${baseUrl}/billing/calls/usage`, {
    method: "POST",
    headers: { authorization: internalHeaders.authorization },
  });
  assert.equal(missingIdentity.status, 401);
  const invalidBody = await requestJson(`${baseUrl}/billing/calls/usage`, {
    method: "POST",
    headers: { ...internalHeaders, "content-type": "application/json" },
    body: "{",
  });
  assert.equal(invalidBody.status, 400);
});
