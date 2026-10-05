import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("docs pin and integrity-check the API console while constraining its network access", async () => {
  const component = await source(
    "apps/docs/src/components/api/scalar-api-reference.tsx",
  );
  const layout = await source("apps/docs/src/app/layout.tsx");

  assert.match(
    component,
    /cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@1\.72\.3"/,
  );
  assert.match(
    component,
    /sha384-HWi\/QCSPi64AQ0xBXFGDk\+7gmvZ4hJ\/7sZMIXqWVz6Ikb6\+Cxej\/hWKaomOStyFb/,
  );
  assert.match(component, /crossOrigin="anonymous"/);
  assert.match(component, /withDefaultFonts:\s*false/);
  assert.doesNotMatch(
    component,
    /cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference["']/,
  );
  assert.match(layout, /httpEquiv="Content-Security-Policy"/);
  assert.match(
    layout,
    /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net/,
  );
  assert.match(layout, /connect-src 'self' https:\/\/api\.quickvoice\.co/);
  assert.match(layout, /object-src 'none'/);
});
