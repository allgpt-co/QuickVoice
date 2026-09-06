import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const routeUrl = new URL("../src/app/api/contact/route.ts", import.meta.url);
const source = readFileSync(routeUrl, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const compiledModule = { exports: {} };
new Function("require", "module", "exports", output)(createRequire(routeUrl), compiledModule, compiledModule.exports);
const { POST } = compiledModule.exports;
const analyticsSource = readFileSync(new URL("../src/lib/analytics.ts", import.meta.url), "utf8");
const analyticsOutput = ts.transpileModule(analyticsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const analyticsModule = { exports: {} };
new Function("module", "exports", analyticsOutput)(analyticsModule, analyticsModule.exports);
const { trackContactLead } = analyticsModule.exports;
const payload = { name: "Test Person", email: "test@example.com", lookingFor: "Evaluation", message: "Please discuss our requirements." };
const request = (body = payload) => ({ json: async () => body });

test("contact success requires acknowledged webhook delivery", async (t) => {
  const previous = process.env.CONTACT_WEBHOOK_URL;
  t.after(() => previous === undefined ? delete process.env.CONTACT_WEBHOOK_URL : process.env.CONTACT_WEBHOOK_URL = previous);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
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

  fetch.mock.mockImplementation(async () => new Response(null, { status: 500 }));
  response = await POST(request());
  assert.equal(response.status, 502);
  assert.notEqual((await response.json()).ok, true);

  fetch.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
  assert.equal((await POST(request())).status, 502);
  assert.equal((await POST(request({ ...payload, email: "invalid" }))).status, 400);
  assert.equal((await POST({ json: async () => { throw new SyntaxError("bad JSON"); } })).status, 400);
});

test("lead analytics sends only fixed form context and remains optional", (t) => {
  const previousWindow = globalThis.window;
  t.after(() => previousWindow === undefined ? delete globalThis.window : globalThis.window = previousWindow);
  delete globalThis.window;
  assert.equal(trackContactLead("homepage"), false);
  const calls = [];
  globalThis.window = { location: { pathname: "/company/contact", search: "?email=private@example.com" }, gtag: (...args) => calls.push(args) };
  assert.equal(trackContactLead("contact_page"), true);
  assert.deepEqual(calls, [["event", "generate_lead", { method: "contact_form", form_location: "contact_page", page_path: "/company/contact" }]]);
  window.gtag = () => { throw new Error("Analytics blocked"); };
  assert.equal(trackContactLead("homepage"), false);
});
