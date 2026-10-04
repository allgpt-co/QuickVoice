import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createGoogleAnalyticsScript } from "../src/lib/google-analytics-config.mjs";
import { applyConsent, CONSENT_KEY, readConsent } from "../src/lib/analytics-consent.mjs";
import { captureEnquiryContext } from "../src/lib/enquiry-context.mjs";

test("missing, corrupt and unavailable storage fail closed", () => {
  for (const value of [null, "", "true", "{broken", "accepted"]) {
    assert.equal(readConsent({ localStorage: { getItem: () => value } }), "unknown");
  }
  assert.equal(readConsent({ get localStorage() { throw new Error("blocked"); } }), "unknown");
  for (const value of ["granted", "denied"]) {
    assert.equal(readConsent({ localStorage: { getItem: (key) => {
      assert.equal(key, CONSENT_KEY);
      return value;
    } } }), value);
  }
});

test("revocation disables collection before consent update and clears only analytics cookies", () => {
  const expired = [];
  const commands = [];
  const browser = {
    quickvoiceAnalyticsMeasurementId: "G-TEST123",
    location: { hostname: "www.quickvoice.co" },
    document: {
      get cookie() { return "_ga=visitor; _ga_TEST123=session; essential=keep"; },
      set cookie(value) { expired.push(value); },
    },
    gtag: (...args) => {
      assert.equal(browser["ga-disable-G-TEST123"], true);
      assert.equal(browser.quickvoiceAnalyticsConsent, "denied");
      commands.push(args);
    },
  };
  assert.equal(applyConsent(browser, "denied"), "denied");
  assert.equal(commands[0][2].analytics_storage, "denied");
  assert.equal(commands[0][2].ad_storage, "denied");
  assert.ok(expired.every((value) => value.startsWith("_ga") && value.includes("Max-Age=0")));
  assert.ok(expired.some((value) => value.includes("Domain=.quickvoice.co")));
  browser.gtag = (...args) => commands.push(args);
  applyConsent(browser, "granted");
  assert.equal(browser["ga-disable-G-TEST123"], false);
  assert.equal(commands.at(-1)[2].analytics_storage, "granted");
  assert.equal(commands.at(-1)[2].ad_user_data, "denied");
  assert.equal(commands.some((args) => args[0] === "event"), false);
});

test("enquiry context is omitted without consent and discarded on revocation", (t) => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  });
  globalThis.window = { location: { href: "https://quickvoice.co/pricing?email=secret@example.com" } };
  globalThis.document = { referrer: "https://www.google.com/?q=secret" };
  assert.equal(captureEnquiryContext(), undefined);
  window.quickvoiceAnalyticsConsent = "granted";
  assert.deepEqual(captureEnquiryContext(), {
    landingPage: "/pricing", source: "google", medium: "organic", method: "browser_observed",
  });
  window.quickvoiceAnalyticsConsent = "denied";
  assert.equal(captureEnquiryContext(), undefined);
  window.location.href = "https://quickvoice.co/company/contact";
  window.quickvoiceAnalyticsConsent = "granted";
  assert.equal(captureEnquiryContext().landingPage, "/company/contact");
});


test("unanswered consent keeps shared GA cookies while collection remains disabled", () => {
  for (const hostname of ["quickvoice.co", "www.quickvoice.co", "docs.quickvoice.co"]) {
    for (const choice of [undefined, "unknown", "corrupt"]) {
      const deleted = [];
      const commands = [];
      const browser = {
        location: { hostname },
        quickvoiceAnalyticsMeasurementId: "G-TEST123",
        document: {
          get cookie() { return "_ga=marketing-visitor; _ga_TEST123=marketing-session; essential=keep"; },
          set cookie(value) { deleted.push(value); },
        },
        gtag: (...args) => commands.push(args),
      };
      for (let visit = 0; visit < 3; visit++) applyConsent(browser, choice);
      assert.deepEqual(deleted, [], `${hostname}: ${choice}`);
      assert.equal(browser["ga-disable-G-TEST123"], true);
      assert.ok(commands.every((args) => args[0] === "consent" && args[2].analytics_storage === "denied"));
    }
  }
});

test("disabled marketing analytics does not mount consent or subscribe to cookie cleanup", () => {
  assert.equal(createGoogleAnalyticsScript("off"), null);
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /googleAnalyticsScript && \(\s*<Suspense[^>]*>\s*<AnalyticsConsent/);
});
