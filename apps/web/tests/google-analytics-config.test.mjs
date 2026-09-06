import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  createGoogleAnalyticsScript,
  manualPageviewsEnabled,
  resolveGoogleAnalyticsId,
} from "../src/lib/google-analytics-config.mjs";

function browser(hostname) {
  const scripts = [];
  const context = {
    window: { location: { hostname } },
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
    assert.equal(commands.length, 2);
    assert.deepEqual(commands[1], ["config", "G-SZFBG11VRP"]);
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
    assert.equal(context.window.dataLayer[1].length, 2);
  }
  const { context } = browser("quickvoice.co");
  assert.equal(manualPageviewsEnabled(" true "), true);
  runInNewContext(createGoogleAnalyticsScript("", true), context);
  assert.equal(context.window.dataLayer[1][2].send_page_view, false);
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
