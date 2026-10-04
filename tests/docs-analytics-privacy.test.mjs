import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("docs do not load analytics outside the marketing consent boundary", async () => {
  const layout = await readFile(
    new URL("../apps/docs/src/app/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(layout, /NEXT_PUBLIC_GA_MEASUREMENT_ID/);
  assert.doesNotMatch(layout, /AnalyticsConsent|analytics-consent|analytics-choices|Privacy choices/);
  assert.doesNotMatch(layout, /document\.cookie|cookieStore|applyConsent|subscribeConsent/);
  assert.doesNotMatch(layout, /googletagmanager|google-analytics|gtag\s*\(/);
});
