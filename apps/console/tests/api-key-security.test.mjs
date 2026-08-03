import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("API-key UI uses Better Auth organization ownership without identity metadata", () => {
  const source = readFileSync(
    join(root, "src/app/(app)/settings/api-keys/page.tsx"),
    "utf8",
  );

  assert.match(source, /query:\s*\{\s*organizationId:\s*orgId\s*\}/);
  assert.match(source, /name:\s*values\.name,\s*organizationId:\s*orgId/s);
  assert.doesNotMatch(source, /referenceId:\s*orgId/);
  assert.doesNotMatch(source, /metadata:\s*\{[^}]*organizationId/s);
  assert.doesNotMatch(source, /metadata:\s*\{[^}]*userId/s);
  assert.match(source, /read-only/i);
  assert.match(source, /cannot manage billing/i);
});
