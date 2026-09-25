import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test, type TestContext } from "node:test";
import type { Server } from "node:http";
import express from "express";
import cors from "cors";
import prisma from "../../src/config/prisma.js";
import errorMiddleware from "../../src/middleware/error.middleware.js";
import notFound from "../../src/middleware/notFound.middleware.js";
import { createPublicWidgetCors } from "../../src/modules/widgets/public-widget-cors.js";

const allowedOrigin = "https://customer.example";
const widgetId = "wgt_test";
const sessionId = "wgs_test";
const endToken = "test-end-token-at-least-20-characters";
let server: Server;
let baseUrl: string;
let livekit: typeof import("../../src/config/livekit.js");
const internalHeaders = {
  authorization: "Bearer endpoint-test-internal-key",
  "x-organization-id": "org_test",
  "x-user-id": "user_test",
};

before(async () => {
  process.env.INTERNAL_API_KEY = "endpoint-test-internal-key";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.BETTER_AUTH_URL = "http://localhost:5000";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-adequate-length-32chars";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  const { redisConnection } = await import("../../src/config/redis.js");
  redisConnection.disconnect();
  const { default: router } = await import("../../src/router.js");
  const { publicWidgetOriginAllowed } =
    await import("../../src/modules/widgets/widget.service.js");
  livekit = await import("../../src/config/livekit.js");
  const app = express();
  const publicPath = "/api/v1/public/widgets";
  app.use(
    `${publicPath}/:widgetId`,
    createPublicWidgetCors(publicWidgetOriginAllowed),
  );
  const consoleCors = cors({
    origin: ["https://console.example"],
    credentials: true,
  });
  app.use((req, res, next) =>
    req.path.startsWith(`${publicPath}/`)
      ? next()
      : consoleCors(req, res, next),
  );
  // Mirrors the production ordering: early errors must retain widget CORS.
  app.use((req, res, next) => {
    if (req.headers["x-test-throttled"])
      return res.status(429).json({ message: "Too many requests" });
    next();
  });
  app.use(express.json({ limit: "1kb" }));
  app.use("/api/v1", router);
  app.use(notFound);
  app.use(errorMiddleware);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

after(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve())),
  );
  await prisma.$disconnect();
});

// Prisma delegates expose methods through a Proxy rather than own descriptors.
function stubMethod(
  t: TestContext,
  target: any,
  name: string,
  implementation: (...args: any[]) => any,
) {
  const original = target[name];
  const stub = t.mock.fn(implementation);
  target[name] = stub;
  t.after(() => {
    target[name] = original;
  });
  return stub;
}

function widget(enabled = true) {
  return {
    widgetId,
    name: "Support",
    organizationId: "org_test",
    agentId: "agent_test",
    enabled,
    allowedOrigins: [allowedOrigin],
    theme: {},
    consentRequired: true,
    consentText: "This call may be recorded.",
    agent: {
      name: "Support",
      isActive: true,
      isConfigured: true,
      configuration: {},
    },
  };
}

test("organization tools returns tenant-scoped tools with redacted secrets and nullable JSON", async (t) => {
  const findMany = stubMethod(t, prisma.tool, "findMany", async (args: any) => {
    assert.deepEqual(args.where, { organizationId: "org_test" });
    assert.deepEqual(args.include.agent.select, { agentId: true, name: true });
    return [
      {
        toolId: "tool_test",
        name: "Lookup",
        agent: [],
        api_body: null,
        api_headers: [{ key: "Authorization", value: "qvsecret:secret_test" }],
        dynamic_variables: null,
      },
    ];
  });
  const response = await fetch(`${baseUrl}/tools`, {
    headers: internalHeaders,
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  assert.equal(findMany.mock.callCount(), 1);
  assert.deepEqual(body.data[0].api_headers, [
    { key: "Authorization", value: null, redacted: true },
  ]);
  assert.equal(body.data[0].dynamic_variables, null);
});

test("organization tools returns an empty list when the organization has no tools", async (t) => {
  stubMethod(t, prisma.tool, "findMany", async () => []);
  const response = await fetch(`${baseUrl}/tools`, {
    headers: internalHeaders,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as any).data, []);
});

test("report preview returns 404 for a missing or another organization's campaign", async (t) => {
  stubMethod(t, prisma.campaign, "findFirst", async (args: any) => {
    assert.deepEqual(args.where, {
      campaignId: "missing",
      organizationId: "org_test",
    });
    return null;
  });
  const response = await fetch(
    `${baseUrl}/outbound-calls/batches/missing/reports/preview`,
    {
      method: "POST",
      headers: { ...internalHeaders, "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 404);
  assert.equal(
    ((await response.json()) as any).message,
    "Batch campaign not found",
  );
});

test("report preview uses stored campaign data and accepts an omitted optional body", async (t) => {
  stubMethod(t, prisma.campaign, "findFirst", async () => ({
    campaignId: "campaign_test",
    experimentAssignments: [],
    conversionEvents: [],
    outboundCalls: [
      {
        outboundId: "out_test",
        optionalData: null,
        status: "COMPLETED",
        callLog: { status: "COMPLETED", callCostCents: 25 },
      },
    ],
    personalizationSchemas: [],
    experiments: [],
    goals: [],
  }));
  const response = await fetch(
    `${baseUrl}/outbound-calls/batches/campaign_test/reports/preview`,
    {
      method: "POST",
      headers: internalHeaders,
    },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  assert.equal(body.data.totals.attempts, 1);
  assert.equal(body.data.evidenceLabel, "observational_not_causal");
});

test("documented public config path returns widget config without authentication", async (t) => {
  stubMethod(t, prisma.agentWidget, "findUnique", async () => widget());
  const response = await fetch(`${baseUrl}/public/widgets/${widgetId}/config`, {
    headers: { origin: allowedOrigin },
  });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    allowedOrigin,
  );
  assert.equal(((await response.json()) as any).data.widgetId, widgetId);
});

test("nonexistent widget is distinguished from an unregistered route", async (t) => {
  stubMethod(t, prisma.agentWidget, "findUnique", async () => null);
  const response = await fetch(`${baseUrl}/public/widgets/${widgetId}/config`);
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as any).message, "Widget not found");
});

test("allowed customer origin can preflight config, start and end with API-client headers", async (t) => {
  stubMethod(t, prisma.agentWidget, "findUnique", async () => widget());
  for (const suffix of ["config", "sessions", `sessions/${sessionId}/end`]) {
    const response = await fetch(
      `${baseUrl}/public/widgets/${widgetId}/${suffix}`,
      {
        method: "OPTIONS",
        headers: {
          origin: allowedOrigin,
          "access-control-request-method": suffix === "config" ? "GET" : "POST",
          "access-control-request-headers":
            "content-type,x-api-key,authorization",
        },
      },
    );
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      allowedOrigin,
    );
    assert.match(
      response.headers.get("access-control-allow-headers") ?? "",
      /x-api-key/i,
    );
    assert.match(
      response.headers.get("access-control-allow-headers") ?? "",
      /authorization/i,
    );
  }
});

test("CORS survives body-parser, validation and rate-limit errors", async (t) => {
  stubMethod(t, prisma.agentWidget, "findUnique", async () => widget());
  for (const request of [
    { body: "{invalid", headers: {}, status: 400 },
    { body: JSON.stringify({ visitorId: 123 }), headers: {}, status: 400 },
    {
      body: JSON.stringify({ visitorId: "x".repeat(2048) }),
      headers: {},
      status: 413,
    },
    { body: "{}", headers: { "x-test-throttled": "1" }, status: 429 },
  ]) {
    const response = await fetch(
      `${baseUrl}/public/widgets/${widgetId}/sessions`,
      {
        method: "POST",
        headers: {
          origin: allowedOrigin,
          "content-type": "application/json",
          ...request.headers,
        },
        body: request.body,
      },
    );
    assert.equal(response.status, request.status);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      allowedOrigin,
    );
  }
});

test("disabled widgets return readable errors and allow existing sessions to end", async (t) => {
  stubMethod(t, prisma.agentWidget, "findUnique", async () => widget(false));
  stubMethod(t, prisma.agentWidgetSession, "findFirst", async () => ({
    sessionId,
    roomName: "widget_room",
    endTokenHash: createHash("sha256").update(endToken).digest("hex"),
  }));
  stubMethod(t, prisma.agentWidgetSession, "updateMany", async () => ({
    count: 1,
  }));
  const deleteRoom = t.mock.method(
    livekit.livekitRoomServiceClient,
    "deleteRoom",
    async () => undefined,
  );
  for (const suffix of ["config", "sessions"]) {
    const response = await fetch(
      `${baseUrl}/public/widgets/${widgetId}/${suffix}`,
      {
        method: suffix === "config" ? "GET" : "POST",
        headers: { origin: allowedOrigin },
      },
    );
    assert.equal(response.status, 404);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      allowedOrigin,
    );
  }
  const response = await fetch(
    `${baseUrl}/public/widgets/${widgetId}/sessions/${sessionId}/end`,
    {
      method: "POST",
      headers: { origin: allowedOrigin, "content-type": "application/json" },
      body: JSON.stringify({ endToken }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    allowedOrigin,
  );
  assert.equal(deleteRoom.mock.callCount(), 1);
});

test("unlisted origins cannot preflight, read config, start or end a session", async (t) => {
  stubMethod(t, prisma.agentWidget, "findUnique", async () => widget());
  for (const origin of [
    "https://evil.example",
    "https://console.example",
    "null",
  ]) {
    for (const suffix of ["config", "sessions", `sessions/${sessionId}/end`]) {
      for (const method of ["OPTIONS", suffix === "config" ? "GET" : "POST"]) {
        const response = await fetch(
          `${baseUrl}/public/widgets/${widgetId}/${suffix}`,
          { method, headers: { origin } },
        );
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
      }
    }
  }
});
