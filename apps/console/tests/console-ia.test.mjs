import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("console shell is organized around lifecycle areas without removing existing routes", async () => {
  const sidebar = await text("src/components/shell/AppSidebar.tsx");
  const ia = await text("src/lib/console-ia.ts");
  const breadcrumbs = await text("src/components/shell/Breadcrumbs.tsx");
  const testingPage = await text("src/app/(app)/testing/page.tsx");

  for (const area of ["build", "test", "deploy", "operate", "improve"]) {
    assert.match(ia, new RegExp(`${area}: \\{`));
    assert.match(sidebar, new RegExp(`areaLabel\\("${area}"\\)`));
  }

  for (const route of ["/dashboard", "/agents", "/numbers", "/outbound", "/calls", "/kb", "/tools", "/secrets", "/settings"]) {
    assert.match(sidebar, new RegExp(`href: "${route}"`));
  }

  assert.match(sidebar, /href: "\/testing"/);
  assert.match(breadcrumbs, /testing: "Testing"/);
  assert.match(testingPage, /Start from an agent/);
});

test("console resource search contract permission-gates actions and high-impact operations require review", async () => {
  const ia = await text("src/lib/console-ia.ts");

  for (const field of ["organizationId", "environmentId", "matchedFields", "allowedActions", "href", "freshness"]) {
    assert.match(ia, new RegExp(field));
  }

  assert.match(ia, /CONFIRMATION_REQUIRED_ACTIONS = new Set/);
  assert.match(ia, /"start"/);
  assert.match(ia, /"stop"/);
  assert.match(ia, /"delete"/);
  assert.match(ia, /permission_denied/);
});
