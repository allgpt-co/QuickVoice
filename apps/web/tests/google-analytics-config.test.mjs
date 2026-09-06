import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createGoogleAnalyticsScript } from "../src/lib/google-analytics-config.mjs";

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
