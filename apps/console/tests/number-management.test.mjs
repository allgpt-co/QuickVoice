import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isBuiltInNumberManager } from "../src/lib/numbers/permissions.ts";

const CONSOLE_ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(CONSOLE_ROOT, path), "utf8");

test("only built-in owners and admins receive phone-number management controls", () => {
  assert.equal(isBuiltInNumberManager("owner"), true);
  assert.equal(isBuiltInNumberManager("admin"), true);
  assert.equal(isBuiltInNumberManager("member"), false);
  assert.equal(isBuiltInNumberManager("custom-operator"), false);
  assert.equal(isBuiltInNumberManager(undefined), false);
  assert.equal(isBuiltInNumberManager("member, admin"), true);

  const page = read("src/app/(app)/numbers/page.tsx");
  assert.match(page, /useActiveMemberRole/);
  assert.match(page, /isBuiltInNumberManager/);
  assert.match(
    page,
    /actions=\{canManageNumbers \? <BuyNumberDrawer \/> : undefined\}/,
  );
  assert.match(page, /readOnly=\{!canManageNumbers\}/);
  assert.match(page, /canManageNumbers &&[\s\S]*<ReleaseNumberDialog/);
});

test("release uses DELETE, invalidates related views, and requires exact typed confirmation", () => {
  const api = read("src/lib/api/resources/numbers.ts");
  const hooks = read("src/hooks/queries/numbers.ts");
  const dialog = read("src/components/numbers/ReleaseNumberDialog.tsx");

  assert.match(api, /apiClient\.delete\(`\/numbers\/\$\{phId\}`\)/);
  assert.match(hooks, /useReleaseNumber/);
  assert.match(hooks, /queryKeys\.numbers\.list/);
  assert.match(hooks, /queryKeys\.agents\.list/);
  assert.match(dialog, /confirmation\.trim\(\) === phoneNumber/);
  assert.match(dialog, /same[\s\n]+number may never be available to buy again/);
  assert.match(dialog, /This cannot be undone/);
  assert.match(dialog, /Release permanently/);
});

test("console provider and quote types match the server response contract", () => {
  const types = read("src/lib/api/types.ts");
  const drawer = read("src/components/numbers/BuyNumberDrawer.tsx");
  const page = read("src/app/(app)/numbers/page.tsx");

  assert.match(types, /TelephonyProvider = "TWILIO" \| "TELNYX"/);
  assert.match(types, /quoteId: string/);
  assert.match(types, /quoteExpiresAt: string/);
  assert.match(types, /rateCatalogVersion: string/);
  assert.match(drawer, /defaultValues: \{ provider: "TWILIO"/);
  assert.match(drawer, /quoteId: number\.quoteId/);
  assert.match(drawer, /isQuoteExpired\(number\.quoteExpiresAt, nowMs\)/);
  assert.match(drawer, /buy\.isPending \|\| quoteExpired/);
  assert.match(drawer, /Quote expired — search again/);
  assert.match(page, /<SelectItem value="TWILIO">Twilio<\/SelectItem>/);
  assert.match(page, /<SelectItem value="TELNYX">Telnyx<\/SelectItem>/);
});
