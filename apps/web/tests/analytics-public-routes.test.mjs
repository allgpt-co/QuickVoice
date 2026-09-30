import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { STATIC_ANALYTICS_PATHS, createPublicAnalyticsPaths } from "../src/lib/analytics-public-routes.mjs";

test("static analytics allowlist matches the current public page files", () => {
  const app = fileURLToPath(new URL("../src/app", import.meta.url));
  const paths = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith("[")) walk(join(dir, entry.name));
      else if (entry.isFile() && entry.name === "page.tsx") {
        paths.push("/" + relative(app, dir).split(sep).join("/"));
      }
    }
  }
  walk(app);
  // New pages require an explicit public/private measurement decision.
  assert.deepEqual([...STATIC_ANALYTICS_PATHS].sort(), paths.sort());
});

test("dynamic routes require explicit safe slugs rather than wildcard namespaces", () => {
  const paths = createPublicAnalyticsPaths(["published-post", "published-post", "../private", "draft?email=secret", "</script>"], ["public-scenario"]);
  assert.equal(paths.filter(path => path === "/blog/published-post").length, 1);
  assert.ok(paths.includes("/case-studies/public-scenario"));
  assert.ok(!paths.includes("/blog/unknown-post"));
  assert.equal(paths.length, STATIC_ANALYTICS_PATHS.length + 2);
});
