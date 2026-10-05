import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function consoleFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("console credential URLs are never exposed to third-party analytics", async () => {
  const [layout, environment] = await Promise.all([
    consoleFile("src/app/layout.tsx"),
    consoleFile(".env.dev.example"),
  ]);

  for (const source of [layout, environment]) {
    assert.doesNotMatch(source, /NEXT_PUBLIC_GA_MEASUREMENT_ID/);
    assert.doesNotMatch(source, /googletagmanager|google-analytics|gtag\s*\(/);
  }
});
