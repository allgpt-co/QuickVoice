import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/quickvoice";

const { ForbiddenError } = await import("../../src/common/errors/forbidden.js");
const { requireBuiltInBillingManager } =
  await import("../../src/modules/billing/billing-manager.middleware.js");

test("an API key cannot use even malicious billing and number scopes", async () => {
  const nextCalls: unknown[] = [];
  await requireBuiltInBillingManager(
    {
      auth: {
        userId: "server_selected_owner",
        activeOrganizationId: "org_a",
        authMethod: "apiKey",
        session: null,
        apiKeyId: "key_a",
        apiKeyPermissions: {
          billing: ["manage"],
          phoneNumber: ["create", "delete"],
          "*": ["*"],
        },
      },
    } as any,
    {} as any,
    (error?: unknown) => nextCalls.push(error),
  );

  assert.equal(nextCalls.length, 1);
  assert.ok(nextCalls[0] instanceof ForbiddenError);
  assert.match((nextCalls[0] as Error).message, /API keys cannot/i);
});

test("trusted internal billing calls retain their explicit trust-boundary bypass", async () => {
  const nextCalls: unknown[] = [];
  await requireBuiltInBillingManager(
    {
      auth: {
        userId: "internal_user",
        activeOrganizationId: "org_a",
        authMethod: "internal",
        session: null,
      },
    } as any,
    {} as any,
    (error?: unknown) => nextCalls.push(error),
  );
  assert.deepEqual(nextCalls, [undefined]);
});
