import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createGoogleAnalyticsScript } from "../src/lib/google-analytics-config.mjs";

const ts = createRequire(import.meta.url)("typescript");
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/analytics.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function fixture({ configuredId = "", hostname = "quickvoice.co" } = {}) {
  const scripts = [];
  const compiledModule = { exports: {} };
  const context = {
    URL, module: compiledModule, exports: compiledModule.exports,
    window: {
      location: { hostname, pathname: "/pricing" },
      quickvoiceAnalyticsConsent: "granted",
    },
    document: {
      getElementById: (id) => scripts.find((script) => script.id === id),
      createElement: () => ({}),
      head: { appendChild: (script) => scripts.push(script) },
    },
  };
  runInNewContext(createGoogleAnalyticsScript(configuredId, false, [
    "/pricing", "/company/contact", "/blog/published-example",
    "/case-studies/public-scenario",
  ]), context);
  runInNewContext(compiled, context);
  return { context, scripts, ...compiledModule.exports,
    events: () => (context.window.dataLayer || []).filter((args) => args[0] === "event"),
  };
}

test("custom events recheck the exact current route after the tag has loaded", () => {
  const f = fixture();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.trackAnalyticsEvent("cta_click", { link_location: "footer" }), true);
  for (const path of ["/dashboard/private-marker", "/blog/unpublished", "/case-studies/unknown", "/pricing/private-marker", "/api/contact"]) {
    f.context.window.location.pathname = path;
    assert.equal(f.trackAnalyticsEvent("cta_click", { page_path: path }), false, path);
  }
  assert.equal(f.events().length, 1);
  for (const path of ["/blog/published-example", "/case-studies/public-scenario", "/pricing/"]) {
    f.context.window.location.pathname = path;
    assert.equal(f.trackAnalyticsEvent("docs_open"), true, path);
  }
  assert.equal(f.events().length, 4);
  assert.equal(f.scripts.length, 1);
});

test("missing or broken route guards fail closed without breaking the user action", () => {
  const f = fixture();
  for (const guard of [undefined, () => false, () => { throw new Error("unavailable"); }]) {
    f.context.window.quickvoiceAnalyticsPageAllowed = guard;
    assert.equal(f.trackAnalyticsEvent("cta_click"), false);
  }
  assert.equal(f.events().length, 0);
});

test("consent still gates events and a blocked lead does not consume its receipt", () => {
  const f = fixture();
  f.context.window.location.pathname = "/unknown";
  assert.equal(f.trackContactLead("contact_page", "synthetic-receipt"), false);
  f.context.window.location.pathname = "/company/contact";
  f.context.window.quickvoiceAnalyticsConsent = "denied";
  assert.equal(f.trackContactLead("contact_page", "synthetic-receipt"), false);
  f.context.window.quickvoiceAnalyticsConsent = "granted";
  assert.equal(f.trackContactLead("contact_page", "synthetic-receipt"), true);
  assert.equal(f.trackContactLead("contact_page", "synthetic-receipt"), false);
  assert.equal(f.events().length, 1);
  assert.equal(JSON.stringify(f.events()).includes("synthetic-receipt"), false);
});

test("event host policy follows the same explicit property override as startup", () => {
  const f = fixture();
  f.context.window.location.hostname = "preview.example.com";
  assert.equal(f.trackAnalyticsEvent("cta_click"), false);
  const override = fixture({ configuredId: "G-TEST123", hostname: "preview.example.com" });
  assert.equal(override.trackAnalyticsEvent("cta_click"), true);
});
