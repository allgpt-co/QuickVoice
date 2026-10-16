import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import { requestJson } from "../helpers/http-client.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const input = { language: "hi", ttsModel: "elevenlabs/eleven_flash_v2_5", voiceId: "UgBBYS2sOqTuMpoF3BR0" };
const wav = Buffer.alloc(48);
wav.write("RIFF", 0);
wav.write("WAVE", 8);
const sample = { audioBase64: wav.toString("base64"), contentType: "audio/wav", sampleText: "नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?" };
let server: Server;
let url: string;
let calls: Array<{ url: string; init?: RequestInit }>;
let upstream: () => Response;
let limits: typeof import("../../src/middleware/rateLimit.middleware.js");
let service: typeof import("../../src/modules/agent/voice-sample.service.js");
let restorePrisma = () => {};

before(async () => {
  Object.assign(process.env, {
    RATE_LIMIT_STORE: "memory", AI_API_URL: "http://quickvoice-ai:5555", INTERNAL_API_KEY: "test-internal-key",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test", STRIPE_SECRET_KEY: "sk_test_placeholder",
    BETTER_AUTH_URL: "http://localhost:5000", BETTER_AUTH_SECRET: "test-secret-with-adequate-length-32chars",
    GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test",
  });
  const { auth } = await import("../../src/lib/auth.js");
  const { default: prisma } = await import("../../src/config/prisma.js");
  mock.method(auth.api, "getSession", async ({ headers }: { headers: Headers }) => {
    const id = headers.get("cookie")?.replace("session=", "");
    return id ? { user: { id }, session: { activeOrganizationId: "org-a" } } : null;
  });
  mock.method(auth.api, "hasPermission", async ({ headers }: { headers: Headers }) => ({ success: headers.get("cookie")?.includes("owner") ?? false }));
  mock.method(auth.api, "verifyApiKey", async () => ({ valid: true, key: { id: "readonly-key", referenceId: "org-a", permissions: { agentConfiguration: ["read"] } } }));
  const findMember = prisma.member.findFirst;
  const findAgent = prisma.agent.findFirst;
  const executeRaw = prisma.$executeRaw;
  prisma.member.findFirst = (async () => ({ userId: "owner" })) as typeof findMember;
  prisma.$executeRaw = (async () => 1) as typeof executeRaw;
  prisma.agent.findFirst = (async ({ where }: { where: { agentId: string; organizationId: string } }) => (
    where.agentId === "agent-a" && where.organizationId === "org-a" ? { agentId: "agent-a" } : null
  )) as typeof findAgent;
  restorePrisma = () => {
    prisma.member.findFirst = findMember;
    prisma.agent.findFirst = findAgent;
    prisma.$executeRaw = executeRaw;
  };
  limits = await import("../../src/middleware/rateLimit.middleware.js");
  service = await import("../../src/modules/agent/voice-sample.service.js");
  const { default: routes } = await import("../../src/modules/agent/agent.route.js");
  const { default: errors } = await import("../../src/middleware/error.middleware.js");
  const app = express();
  app.use(express.json(), routes, errors);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}/agent-a/voice-sample`;
});

beforeEach(async () => {
  calls = [];
  upstream = () => Response.json(sample);
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return upstream(); };
  await limits.voiceSampleUserRateLimit.resetKey("user:owner");
  await limits.voiceSampleOrgRateLimit.resetKey("org:org-a");
});

after(async () => {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
  mock.restoreAll();
  restorePrisma();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function request(body: unknown = input, cookie = "session=owner") {
  return requestJson(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", cookie } });
}

test("voice samples use unsaved selections and return audio through the authenticated server", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, sample);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal(calls[0]?.url, "http://quickvoice-ai:5555/voice/sample");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), input);
  assert.deepEqual(calls[0]?.init?.headers, { "content-type": "application/json", "x-internal-key": "test-internal-key" });
});

test("anonymous users, read-only members, and read-only keys cannot consume TTS quota", async () => {
  assert.equal((await request(input, "")).status, 401);
  assert.equal((await request(input, "session=member")).status, 403);
  assert.equal((await requestJson(url, { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-api-key": "readonly-key" } })).status, 403);
  assert.equal(calls.length, 0);
});

test("samples reject arbitrary text and cannot reference another organization's agent", async () => {
  assert.equal((await request({ ...input, text: "user supplied" })).status, 400);
  await assert.rejects(service.createVoiceSample("org-b", "agent-a", input), { statusCode: 404 });
  assert.equal(calls.length, 0);
});

test("sample generation has user and organization quotas", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await request()).status, 200);
  const limited = await request();
  assert.equal(limited.status, 429);
  assert.ok(limited.headers["retry-after"]);
  await limits.voiceSampleOrgRateLimit.resetKey("org:org-a");
  for (let i = 0; i < 100; i++) assert.equal((await request(input, `session=owner-${i}`)).status, 200);
  assert.equal((await request(input, "session=owner-extra")).status, 429);
});

test("upstream failures and invalid or oversized audio produce bounded errors", async () => {
  upstream = () => Response.json({ detail: "The selected speech provider is not configured" }, { status: 503 });
  await assert.rejects(service.createVoiceSample("org-a", "agent-a", input), { statusCode: 503, message: "The selected speech provider is not configured" });
  for (const response of [Response.json({ ...sample, audioBase64: Buffer.alloc(48).toString("base64") }), new Response("x".repeat(1_500_001))]) {
    upstream = () => response;
    await assert.rejects(service.createVoiceSample("org-a", "agent-a", input), { statusCode: 503 });
  }
});
