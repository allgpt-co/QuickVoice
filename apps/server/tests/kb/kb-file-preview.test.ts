import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { request, type Server } from "node:http";
import { Readable } from "node:stream";
import express from "express";
import { S3Client } from "@aws-sdk/client-s3";

const originalEnv = { ...process.env };
const source = {
  kbId: "kb-a", organizationId: "org-a", sourceType: "TXT", name: "Instructions",
  storagePath: "kb/org-a/8d55565f-1111-4111-8111-f95fd03f0df2.txt", originalFileName: "Instructions.txt",
};
let server: Server;
let base: string;
let storageCalls = 0;
let read: (signal: AbortSignal) => Promise<{ Body: Readable; ContentLength?: number }>;
let restorePrisma = () => {};

before(async () => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test", STRIPE_SECRET_KEY: "sk_test_placeholder",
    BETTER_AUTH_URL: "http://localhost:5000", BETTER_AUTH_SECRET: "test-secret-with-adequate-length-32chars",
    GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", S3_BUCKET_NAME: "private-test-bucket",
  });
  const { auth } = await import("../../src/lib/auth.js");
  const { default: prisma } = await import("../../src/config/prisma.js");
  mock.method(auth.api, "getSession", async ({ headers }: { headers: Headers }) => {
    const id = headers.get("cookie")?.replace("session=", "");
    return id ? { user: { id }, session: { activeOrganizationId: id === "foreign" ? "org-b" : "org-a" } } : null;
  });
  mock.method(auth.api, "hasPermission", async ({ headers }: { headers: Headers }) => ({ success: !headers.get("cookie")?.includes("denied") }));
  mock.method(auth.api, "verifyApiKey", async () => ({ valid: true, key: { id: "key", referenceId: "org-a", permissions: {} } }));
  const findMember = prisma.member.findFirst;
  const findSource = prisma.knowledgeSource.findFirst;
  const executeRaw = prisma.$executeRaw;
  prisma.member.findFirst = (async () => ({ userId: "owner" })) as typeof findMember;
  prisma.$executeRaw = (async () => 1) as typeof executeRaw;
  prisma.knowledgeSource.findFirst = (async ({ where }: { where: { kbId: string; organizationId: string } }) =>
    where.kbId === source.kbId && where.organizationId === source.organizationId ? { ...source } : null) as typeof findSource;
  restorePrisma = () => {
    prisma.member.findFirst = findMember;
    prisma.knowledgeSource.findFirst = findSource;
    prisma.$executeRaw = executeRaw;
  };
  mock.method(S3Client.prototype, "send", async (command: { input: { Key: string } }, options: { abortSignal: AbortSignal }) => {
    storageCalls++;
    assert.equal(command.input.Key, source.storagePath);
    return read(options.abortSignal);
  });
  const { default: routes } = await import("../../src/modules/kb/kb.route.js");
  const { default: errors } = await import("../../src/middleware/error.middleware.js");
  const app = express();
  app.use(routes, errors);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  storageCalls = 0;
  read = async () => ({ Body: Readable.from([Buffer.from("नमस्ते <script>alert('test')</script>\n")]) });
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  mock.restoreAll();
  restorePrisma();
  process.env = originalEnv;
});

function getFile(path = "/kb-a/file?disposition=inline", cookie = "session=reader", headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = request(`${base}${path}`, { headers: { cookie, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("preview streams original UTF-8 bytes through the API without a storage redirect", async () => {
  const response = await getFile();
  assert.equal(response.status, 200);
  assert.equal(response.body.toString(), "नमस्ते <script>alert('test')</script>\n");
  assert.equal(response.headers["content-type"], "text/plain; charset=utf-8");
  assert.equal(response.headers["content-disposition"], 'inline; filename="Instructions.txt"');
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers.location, undefined);
  assert.equal(storageCalls, 1);
});

test("download streams the complete file with attachment headers", async () => {
  const response = await getFile("/kb-a/file?disposition=attachment");
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/octet-stream");
  assert.equal(response.headers["content-disposition"], 'attachment; filename="Instructions.txt"');
  assert.ok(response.body.length > 0);
});

test("anonymous, unauthorized, unscoped keys, missing and foreign documents never reach storage", async () => {
  assert.equal((await getFile(undefined, "")).status, 401);
  assert.equal((await getFile(undefined, "session=denied")).status, 403);
  assert.equal((await getFile(undefined, "", { "x-api-key": "unscoped" })).status, 403);
  assert.equal((await getFile(undefined, "session=foreign")).status, 404);
  assert.equal((await getFile("/missing/file")).status, 404);
  assert.equal((await getFile("/kb-a/file?disposition=invalid")).status, 400);
  assert.equal(storageCalls, 0);
});

test("missing S3 objects return 404; oversized objects are rejected and closed", async () => {
  read = async () => { throw Object.assign(new Error("private storage details"), { name: "NoSuchKey" }); };
  assert.equal((await getFile()).status, 404);
  const body = Readable.from(["too large"]);
  read = async () => ({ Body: body, ContentLength: 10 * 1024 * 1024 + 1 });
  assert.equal((await getFile()).status, 413);
  assert.equal(body.destroyed, true);
});

test("disconnecting a pending preview aborts the storage request", { timeout: 3000 }, async () => {
  let started!: () => void;
  let aborted!: () => void;
  const hasStarted = new Promise<void>((resolve) => { started = resolve; });
  const hasAborted = new Promise<void>((resolve) => { aborted = resolve; });
  read = async (signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => {
      aborted();
      reject(new Error("cancelled"));
    }, { once: true });
    started();
  });
  const client = request(`${base}/kb-a/file`, { headers: { cookie: "session=reader" } });
  client.on("error", () => {});
  client.end();
  try {
    await hasStarted;
    client.destroy();
    await hasAborted;
  } finally {
    client.destroy();
  }
});
