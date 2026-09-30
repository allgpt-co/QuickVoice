import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  createGoogleAnalyticsScript,
  manualPageviewsEnabled,
  resolveGoogleAnalyticsId,
} from "../src/lib/google-analytics-config.mjs";

function browser(hostname, consent = "granted") {
  const scripts = [];
  const context = {
    URL,
    window: { location: { hostname, pathname: "/" }, quickvoiceAnalyticsConsent: consent },
    document: {
      getElementById: (id) => scripts.find((script) => script.id === id),
      createElement: () => ({}),
      head: { appendChild: (script) => scripts.push(script) },
    },
  };
  return { scripts, context };
}

test("missing build configuration initializes QuickVoice's verified tag once on its own hosts", () => {
  for (const host of ["quickvoice.co", "www.quickvoice.co"]) {
    const { scripts, context } = browser(host);
    const bootstrap = createGoogleAnalyticsScript();
    runInNewContext(bootstrap, context);
    runInNewContext(bootstrap, context);
    assert.equal(scripts.length, 1);
    assert.equal(
      scripts[0].src,
      "https://www.googletagmanager.com/gtag/js?id=G-SZFBG11VRP",
    );
    assert.equal(scripts[0].async, true);
    const commands = context.window.dataLayer.map((args) => Array.from(args));
    assert.equal(commands.length, 5);
    assert.equal(commands[0][0], "consent");
    assert.equal(commands[0][2].analytics_storage, "denied");
    assert.equal(commands[1][2].analytics_storage, "granted");
    assert.equal(commands[0][2].ad_user_data, "denied");
    assert.deepEqual(commands[4], ["config", "G-SZFBG11VRP"]);
  }
});

test("default tracking does not run on development, preview, or other self-hosted domains", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "preview.quickvoice.co",
    "example.com",
  ]) {
    const { scripts, context } = browser(host);
    runInNewContext(createGoogleAnalyticsScript("  "), context);
    assert.equal(scripts.length, 0);
    assert.equal(context.window.gtag, undefined);
  }
});

test("explicit configuration supports a different property and an off switch", () => {
  const { scripts, context } = browser("preview.example.com");
  runInNewContext(createGoogleAnalyticsScript(" G-TEST123 "), context);
  assert.equal(
    scripts[0].src,
    "https://www.googletagmanager.com/gtag/js?id=G-TEST123",
  );
  assert.equal(createGoogleAnalyticsScript("off"), null);
  assert.throws(
    () => createGoogleAnalyticsScript("invalid'ID"),
    /must be a GA4 G- ID or off/,
  );
});

test("manual pageviews require an explicit opt-in and suppress the automatic initial view only then", () => {
  for (const setting of [undefined, "", "false", "1", "yes"]) {
    assert.equal(manualPageviewsEnabled(setting), false);
    const { context } = browser("quickvoice.co");
    runInNewContext(createGoogleAnalyticsScript("", manualPageviewsEnabled(setting)), context);
    assert.equal(context.window.dataLayer[4].length, 2);
  }
  const { context } = browser("quickvoice.co");
  assert.equal(manualPageviewsEnabled(" true "), true);
  runInNewContext(createGoogleAnalyticsScript("", true), context);
  assert.equal(context.window.dataLayer[4][2].send_page_view, false);
  assert.equal(context.window.dataLayer.filter((args) => args[0] === "event").length, 0);
});

test("the pageview coordinator uses the same destination and host guards as the bootstrap", () => {
  assert.equal(resolveGoogleAnalyticsId("", "quickvoice.co"), "G-SZFBG11VRP");
  assert.equal(resolveGoogleAnalyticsId("", "www.quickvoice.co"), "G-SZFBG11VRP");
  for (const host of ["localhost", "preview.quickvoice.co", "quickvoice.co.example.com"]) {
    assert.equal(resolveGoogleAnalyticsId("", host), null);
    const { context, scripts } = browser(host);
    runInNewContext(createGoogleAnalyticsScript("", true), context);
    assert.equal(scripts.length, 0);
  }
  assert.equal(resolveGoogleAnalyticsId("G-TEST123", "localhost"), "G-TEST123");
  assert.equal(resolveGoogleAnalyticsId("off", "quickvoice.co"), null);
  assert.equal(createGoogleAnalyticsScript("off", true), null);
});


test("unknown or declined consent never loads a tag or queues measurement", () => {
  for (const choice of [undefined, null, "unknown", "denied", "true"]) {
    const { scripts, context } = browser("quickvoice.co", choice);
    context.window.quickvoiceAnalyticsConsent = choice;
    runInNewContext(createGoogleAnalyticsScript(), context);
    assert.equal(scripts.length, 0);
    assert.equal(context.window.gtag, undefined);
    assert.equal(context.window.dataLayer, undefined);
  }
});

test("a consented direct private or unknown visit does not load or configure Analytics", () => {
  for (const pathname of ["/login", "/app/customer-123", "/api/contact", "/unknown-marker",
    "/blog/unknown-post", "/solutions/unknown-solution", "/case-studies/unknown-customer", "/pricing/private-marker"]) {
    for (const manual of [false, true]) {
      const { context, scripts } = browser("quickvoice.co");
      context.window.location.pathname = pathname;
      runInNewContext(createGoogleAnalyticsScript("", manual), context);
      assert.equal(scripts.length, 0, pathname);
      assert.equal(context.window.gtag, undefined, pathname);
      assert.equal(context.window.dataLayer, undefined, pathname);
    }
  }
});

test("a blocked initial visit can start once on a known public page while still respecting consent", () => {
  const { context, scripts } = browser("quickvoice.co");
  context.window.location.pathname = "/unknown-marker";
  runInNewContext(createGoogleAnalyticsScript(), context);
  context.window.quickvoiceStartAnalytics();
  assert.equal(scripts.length, 0);
  context.window.location.pathname = "/pricing/";
  context.window.quickvoiceAnalyticsConsent = "denied";
  context.window.quickvoiceStartAnalytics();
  assert.equal(scripts.length, 0);
  context.window.quickvoiceAnalyticsConsent = "granted";
  context.window.quickvoiceStartAnalytics();
  context.window.quickvoiceStartAnalytics();
  assert.equal(scripts.length, 1);
  assert.equal(context.window.dataLayer.filter(args => args[0] === "config").length, 1);
});

test("only content slugs explicitly provided by the server may initialize the tag", () => {
  const paths = ["/", "/blog/published-example", "/case-studies/public-scenario"];
  for (const pathname of paths.slice(1)) {
    const { context, scripts } = browser("quickvoice.co");
    context.window.location.pathname = pathname;
    runInNewContext(createGoogleAnalyticsScript("", false, paths), context);
    assert.equal(scripts.length, 1, pathname);
  }
  const { context, scripts } = browser("quickvoice.co");
  context.window.location.pathname = "/blog/unpublished-example";
  runInNewContext(createGoogleAnalyticsScript("", false, paths), context);
  assert.equal(scripts.length, 0);
});

test("bootstrap keeps only the HTTP referral origin before automatic measurement starts", () => {
  for (const [referrer, expected] of [
    ["https://search.example/private/account?q=synthetic#details", "https://search.example"],
    ["http://referral.example:8080/customer/123?message=synthetic", "http://referral.example:8080"],
    ["https://user:password@referral.example/private?email=qa%40example.invalid", "https://referral.example"],
    ["", ""], [undefined, ""], ["not a URL", ""],
    ["javascript:alert(1)", ""], ["data:text/plain,synthetic", ""],
    ["file:///private/report", ""],
  ]) {
    const { context } = browser("quickvoice.co");
    context.document.referrer = referrer;
    runInNewContext(createGoogleAnalyticsScript(), context);
    const commands = context.window.dataLayer.map((args) => Array.from(args));
    const settingIndex = commands.findIndex(([command, values]) => command === "set" && "page_referrer" in values);
    const configIndex = commands.findIndex(([command]) => command === "config");
    assert.ok(settingIndex < configIndex);
    assert.equal(commands[settingIndex][1].page_referrer, expected);
    assert.equal(commands[settingIndex][1].page_location, undefined);
    assert.deepEqual(commands[configIndex], ["config", "G-SZFBG11VRP"]);
    assert.equal(commands.some(([command]) => command === "event"), false);
  }
});
