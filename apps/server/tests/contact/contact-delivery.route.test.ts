import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import express from "express";

import contactRouter from "../../src/modules/contact/contact.route.js";
import { requestJson } from "../helpers/http-client.js";

const secret = "contact-test-secret-at-least-32-characters";
const submission = {
  name: "Ada <script>alert('test')</script>",
  email: "ada@example.com",
  company: "A & B",
  phone: "+1 (202) 555-0100",
  lookingFor: "Pilot evaluation",
  message:
    "Please review <img src=x onerror=alert(1)> as plain text.\nSecond line.",
  source: "quickvoice-web-contact",
  submittedAt: "2026-09-06T12:00:00.000Z",
};
let server: Server;
let baseUrl: string;
const originalEnv = { ...process.env };

before(async () => {
  process.env.CONTACT_WEBHOOK_SECRET = secret;
  delete process.env.CONTACT_RECIPIENT_EMAIL;
  process.env.FROM_EMAIL = "verified@example.com";
  process.env.ZEPTOMAIL_TOKEN = "provider-test-token";
  process.env.ZEPTOMAIL_URL = "https://api.zeptomail.com";
  const app = express();
  // The router is relative to index.ts's configured API_VERSION mount.
  app.use("/api/test-version", contactRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}/api/test-version/contact-delivery`;
});

after(async () => {
  process.env = originalEnv;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function post(body: unknown = submission, suppliedSecret?: string) {
  return requestJson(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(suppliedSecret === undefined
        ? {}
        : { "X-QuickVoice-Contact-Secret": suppliedSecret }),
    },
    body: JSON.stringify(body),
  });
}

test("contact delivery fails closed before sending when the secret is unavailable or wrong", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 200 }),
  );
  delete process.env.CONTACT_WEBHOOK_SECRET;
  assert.equal((await post(submission, secret)).status, 503);
  process.env.CONTACT_WEBHOOK_SECRET = "too-short";
  assert.equal((await post(submission, "too-short")).status, 503);
  process.env.CONTACT_WEBHOOK_SECRET = secret;
  for (const supplied of [
    undefined,
    "wrong",
    "x".repeat(secret.length),
    `${secret}, ${secret}`,
  ]) {
    assert.equal((await post(submission, supplied)).status, 401);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("contact delivery revalidates content and rejects recipient/header injection", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 200 }),
  );
  for (const body of [
    null,
    [],
    {},
    { ...submission, name: "A" },
    { ...submission, message: "x".repeat(5001) },
    { ...submission, message: "short" },
    { ...submission, email: "ada@example.com\r\nBcc: victim@example.com" },
    { ...submission, email: "ada@example.com,victim@example.com" },
    { ...submission, email: "Ada <ada@example.com>" },
    { ...submission, phone: "not a phone" },
    { ...submission, source: "arbitrary-client" },
    { ...submission, submittedAt: "not a timestamp" },
    { ...submission, to: "victim@example.com" },
    { ...submission, recipient: "victim@example.com" },
    { ...submission, replyTo: "victim@example.com" },
  ]) {
    assert.equal((await post(body, secret)).status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("contact JSON parsing is bounded and happens only after authentication", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}", { status: 200 }),
  );
  for (const [body, expected] of [
    ["{broken", 400],
    [JSON.stringify({ message: "x".repeat(40_000) }), 413],
  ] as const) {
    for (const supplied of [undefined, secret]) {
      const response = await requestJson(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(supplied ? { "X-QuickVoice-Contact-Secret": supplied } : {}),
        },
        body,
      });
      assert.equal(response.status, supplied ? expected : 401);
    }
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("authenticated contact uses the fixed recipient, verified sender, Reply-To and escaped body", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}", { status: 200 }),
  );
  const response = await post(submission, secret);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(fetch.mock.callCount(), 1);
  const init = fetch.mock.calls[0]!.arguments[1] as RequestInit;
  const message = JSON.parse(init.body as string);
  assert.deepEqual(message.to, [
    {
      email_address: { address: "info@quickvoice.co", name: "QuickVoice team" },
    },
  ]);
  assert.equal(message.from.address, "verified@example.com");
  assert.deepEqual(message.reply_to, [{ address: submission.email }]);
  assert.equal(message.subject, "New QuickVoice website enquiry");
  assert.ok(message.textbody.includes(submission.message));
  assert.match(message.htmlbody, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(message.htmlbody, /A &amp; B/);
  assert.doesNotMatch(message.htmlbody, /<script|<img/);
  assert.equal(init.signal?.aborted, false);
});

test("provider rejection produces one controlled failure, no retry and no leaked provider data", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private-provider-response", { status: 500 }),
  );
  const log = t.mock.method(console, "error", () => {});
  const response = await post(submission, secret);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "Contact email delivery could not be confirmed",
  });
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(log.mock.calls[0]!.arguments, [
    "Contact email delivery failed",
  ]);
});

test("optional enquiry context survives delivery for reconciliation without accepting arbitrary metadata", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));
  const context = {
    ...submission,
    submissionId: "894c976a-b9cd-487c-9e6d-fc0ce42f9143",
    formLocation: "contact_page",
    attribution: { method: "browser_observed", landingPage: "/blog/vapi-alternatives", source: "google", medium: "organic" },
  };
  assert.equal((await post(context, secret)).status, 200);
  const mail = JSON.parse((fetch.mock.calls[0]!.arguments[1] as RequestInit).body as string);
  assert.match(mail.textbody, /Submission ID: 894c976a-b9cd-487c-9e6d-fc0ce42f9143/);
  assert.match(mail.textbody, /Landing page: \/blog\/vapi-alternatives/);
  assert.match(mail.textbody, /google \/ organic/);
  assert.match(mail.textbody, /not verified attribution or country/);
  for (const invalid of [
    { ...context, submissionId: "person@example.com" },
    { ...context, formLocation: "admin" },
    { ...context, attribution: { ...context.attribution, landingPage: "/pricing?email=private@example.com" } },
    { ...context, attribution: { ...context.attribution, referrer: "https://google.com/?q=private" } },
    { ...context, attribution: { ...context.attribution, medium: "made-up" } },
    { ...context, attribution: { ...context.attribution, method: "verified" } },
  ]) assert.equal((await post(invalid, secret)).status, 400);
  assert.equal(fetch.mock.callCount(), 1);
});
