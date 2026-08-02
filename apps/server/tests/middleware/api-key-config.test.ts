import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { admin, member, owner } from "../../src/lib/permissions.js";

const authSource = readFileSync(
  new URL("../../src/lib/auth.ts", import.meta.url),
  "utf8",
);

test("Better Auth API keys are organization-owned with metadata and session emulation disabled", () => {
  assert.match(authSource, /apiKey\(\{[\s\S]*references:\s*"organization"/);
  assert.match(authSource, /enableMetadata:\s*false/);
  assert.match(authSource, /enableSessionForAPIKeys:\s*false/);
  assert.match(
    authSource,
    /defaultPermissions:\s*ORGANIZATION_API_KEY_PERMISSIONS/,
  );
});

test("only built-in owners and admins can issue organization API keys", () => {
  assert.equal(owner.authorize({ apiKey: ["create"] }).success, true);
  assert.equal(admin.authorize({ apiKey: ["create"] }).success, true);
  assert.equal(member.authorize({ apiKey: ["create"] }).success, false);
});
