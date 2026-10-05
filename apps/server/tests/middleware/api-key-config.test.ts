import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { admin, member, owner } from "../../src/lib/permissions.js";

const authSource = readFileSync(
  new URL("../../src/lib/auth.ts", import.meta.url),
  "utf8",
);
const prismaSchema = readFileSync(
  new URL("../../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20261001000000_disable_duplicate_api_key_rate_limit/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Better Auth API keys are organization-owned with metadata and session emulation disabled", () => {
  assert.match(authSource, /apiKey\(\{[\s\S]*references:\s*"organization"/);
  assert.match(authSource, /enableMetadata:\s*false/);
  assert.match(authSource, /enableSessionForAPIKeys:\s*false/);
  assert.match(authSource, /rateLimit:\s*\{\s*enabled:\s*false\s*\}/);
  assert.match(
    authSource,
    /defaultPermissions:\s*ORGANIZATION_API_KEY_PERMISSIONS/,
  );
});

test("organization API keys rely on the shared Redis rate limiter", () => {
  assert.match(
    prismaSchema,
    /rateLimitEnabled\s+Boolean\?\s+@default\(false\)/,
  );
  assert.match(prismaSchema, /rateLimitTimeWindow\s+Int\?\s+@default\(60000\)/);
  assert.match(prismaSchema, /rateLimitMax\s+Int\?\s+@default\(300\)/);
  assert.match(migration, /UPDATE "Apikey"/);
  assert.match(migration, /"rateLimitEnabled" = false/);
  assert.match(migration, /"requestCount" = 0/);
});

test("only built-in owners and admins can issue organization API keys", () => {
  assert.equal(owner.authorize({ apiKey: ["create"] }).success, true);
  assert.equal(admin.authorize({ apiKey: ["create"] }).success, true);
  assert.equal(member.authorize({ apiKey: ["create"] }).success, false);
});

test("only owners and admins can create billable agent previews", () => {
  assert.equal(owner.authorize({ agentPreview: ["create"] }).success, true);
  assert.equal(admin.authorize({ agentPreview: ["create"] }).success, true);
  assert.equal(member.authorize({ agentPreview: ["create"] }).success, false);
});
