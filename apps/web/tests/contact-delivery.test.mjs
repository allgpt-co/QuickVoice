import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const routeUrl = new URL("../src/app/api/contact/route.ts", import.meta.url);
const source = readFileSync(routeUrl, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const compiledModule = { exports: {} };
new Function("require", "module", "exports", output)(
  createRequire(routeUrl),
  compiledModule,
  compiledModule.exports,
);
const { POST } = compiledModule.exports;
const analyticsSource = readFileSync(
  new URL("../src/lib/analytics.ts", import.meta.url),
  "utf8",
);
const analyticsOutput = ts.transpileModule(analyticsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const analyticsModule = { exports: {} };
new Function("module", "exports", analyticsOutput)(
  analyticsModule,
  analyticsModule.exports,
);
const { trackContactLead } = analyticsModule.exports;
const payload = {
  name: "Test Person",
  email: "test@example.com",
  lookingFor: "Evaluation",
  message: "Please discuss our requirements.",
};
const request = (body = payload) => ({ json: async () => body });

test("contact success requires acknowledged webhook delivery", async (t) => {
  const previous = process.env.CONTACT_WEBHOOK_URL;
  const previousSecret = process.env.CONTACT_WEBHOOK_SECRET;
  t.after(() =>
    previous === undefined
      ? delete process.env.CONTACT_WEBHOOK_URL
      : (process.env.CONTACT_WEBHOOK_URL = previous),
  );
  t.after(() =>
    previousSecret === undefined
      ? delete process.env.CONTACT_WEBHOOK_SECRET
      : (process.env.CONTACT_WEBHOOK_SECRET = previousSecret),
  );
  delete process.env.CONTACT_WEBHOOK_SECRET;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 204 }),
  );
  t.mock.method(console, "error", () => {});

  delete process.env.CONTACT_WEBHOOK_URL;
  let response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(fetch.mock.callCount(), 0);
  assert.notEqual((await response.json()).ok, true);

  process.env.CONTACT_WEBHOOK_URL = "https://contact.example/webhook";
  response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(fetch.mock.calls[0].arguments[1].headers, {
    "Content-Type": "application/json",
  });
  assert.equal(fetch.mock.calls[0].arguments[1].redirect, undefined);

  fetch.mock.mockImplementation(
    async () => new Response(null, { status: 500 }),
  );
  response = await POST(request());
  assert.equal(response.status, 502);
  assert.notEqual((await response.json()).ok, true);

  fetch.mock.mockImplementation(async () => {
    throw new Error("Network unavailable");
  });
  assert.equal((await POST(request())).status, 502);
  assert.equal(
    (await POST(request({ ...payload, email: "invalid" }))).status,
    400,
  );
  assert.equal(
    (
      await POST({
        json: async () => {
          throw new SyntaxError("bad JSON");
        },
      })
    ).status,
    400,
  );
});

test("contact forwarding adds only the server-configured secret and rejects authenticated redirects", async (t) => {
  const previousUrl = process.env.CONTACT_WEBHOOK_URL;
  const previousSecret = process.env.CONTACT_WEBHOOK_SECRET;
  t.after(() =>
    previousUrl === undefined
      ? delete process.env.CONTACT_WEBHOOK_URL
      : (process.env.CONTACT_WEBHOOK_URL = previousUrl),
  );
  t.after(() =>
    previousSecret === undefined
      ? delete process.env.CONTACT_WEBHOOK_SECRET
      : (process.env.CONTACT_WEBHOOK_SECRET = previousSecret),
  );
  process.env.CONTACT_WEBHOOK_URL =
    "https://api.example.com/api/v1/contact-delivery";
  process.env.CONTACT_WEBHOOK_SECRET =
    " server-configured-contact-secret-32chars ";
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 200 }),
  );
  t.mock.method(console, "error", () => {});
  const response = await POST(
    request({
      ...payload,
      to: "other@example.com",
      secret: "visitor-controlled",
    }),
  );
  assert.equal(response.status, 200);
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(url, process.env.CONTACT_WEBHOOK_URL);
  assert.equal(
    init.headers["X-QuickVoice-Contact-Secret"],
    "server-configured-contact-secret-32chars",
  );
  assert.equal(init.redirect, "error");
  const body = JSON.parse(init.body);
  assert.equal(body.source, "quickvoice-web-contact");
  assert.equal(body.to, undefined);
  assert.equal(body.secret, undefined);
  assert.equal(
    JSON.stringify(await response.json()).includes("server-configured"),
    false,
  );

  fetch.mock.mockImplementation(
    async () => new Response(null, { status: 401 }),
  );
  const failed = await POST(request());
  assert.equal(failed.status, 502);
  assert.notEqual((await failed.json()).ok, true);
  assert.equal(fetch.mock.callCount(), 2);
});

test("lead analytics sends only fixed form context and remains optional", (t) => {
  const previousWindow = globalThis.window;
  t.after(() =>
    previousWindow === undefined
      ? delete globalThis.window
      : (globalThis.window = previousWindow),
  );
  delete globalThis.window;
  assert.equal(trackContactLead("homepage"), false);
  const calls = [];
  globalThis.window = {
    location: {
      pathname: "/company/contact",
      search: "?email=private@example.com",
    },
    gtag: (...args) => calls.push(args),
  };
  assert.equal(trackContactLead("contact_page"), true);
  assert.deepEqual(calls, [
    [
      "event",
      "generate_lead",
      {
        method: "contact_form",
        form_location: "contact_page",
        page_path: "/company/contact",
      },
    ],
  ]);
  window.gtag = () => {
    throw new Error("Analytics blocked");
  };
  assert.equal(trackContactLead("homepage"), false);
});

test("contact API rejects oversized or invalid fields before forwarding and keeps normalized valid values", async (t) => {
  const previous = process.env.CONTACT_WEBHOOK_URL;
  t.after(() =>
    previous === undefined
      ? delete process.env.CONTACT_WEBHOOK_URL
      : (process.env.CONTACT_WEBHOOK_URL = previous),
  );
  process.env.CONTACT_WEBHOOK_URL = "https://contact.example/webhook";
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 204 }),
  );
  for (const [field, value] of [
    ["name", "n".repeat(121)],
    ["message", "m".repeat(5001)],
    ["company", "c".repeat(161)],
    ["lookingFor", "l".repeat(121)],
    ["phone", {}],
  ]) {
    const response = await POST(request({ ...payload, [field]: value }));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fieldErrors[field]);
  }
  assert.equal(fetch.mock.callCount(), 0);
  const response = await POST(
    request({
      ...payload,
      email: " TEST@EXAMPLE.COM ",
      phone: " +1 (218) 452-5998 ",
      message: "m".repeat(5000),
    }),
  );
  assert.equal(response.status, 200);
  const forwarded = JSON.parse(fetch.mock.calls[0].arguments[1].body);
  assert.equal(forwarded.email, "test@example.com");
  assert.equal(forwarded.phone, "+1 (218) 452-5998");
  assert.equal(forwarded.message.length, 5000);
});

test("contact response waits for delivery acknowledgement without retrying", async (t) => {
  const previous = process.env.CONTACT_WEBHOOK_URL;
  t.after(() =>
    previous === undefined
      ? delete process.env.CONTACT_WEBHOOK_URL
      : (process.env.CONTACT_WEBHOOK_URL = previous),
  );
  process.env.CONTACT_WEBHOOK_URL = "https://contact.example/webhook";
  let acknowledge;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  );
  let returned = false;
  const pending = POST(request()).then((result) => {
    returned = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned, false);
  assert.equal(fetch.mock.callCount(), 1);
  acknowledge(new Response(null, { status: 204 }));
  assert.equal((await pending).status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});
