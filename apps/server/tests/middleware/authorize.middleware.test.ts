import assert from "node:assert/strict";
import { test } from "node:test";

process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder";
process.env.BETTER_AUTH_URL ||= "http://localhost:5000";
process.env.BETTER_AUTH_SECRET ||= "test-secret-with-adequate-length-32chars";
process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

const { ForbiddenError } = await import("../../src/common/errors/forbidden.js");
const { requirePermission } = await import("../../src/middleware/authorize.middleware.js");

test("requirePermission denies API keys without the required route permission", async () => {
  const middleware = requirePermission({ phoneNumber: ["create"] });
  const errors: unknown[] = [];

  await middleware(
    {
      auth: {
        userId: "user_123",
        activeOrganizationId: "org_123",
        authMethod: "apiKey",
        session: null,
      },
      headers: {},
    } as any,
    {} as any,
    (error?: unknown) => {
      errors.push(error);
    }
  );

  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ForbiddenError);
  assert.match((errors[0] as Error).message, /Insufficient permissions/);
});

test("requirePermission allows API keys with the required route permission", async () => {
  const middleware = requirePermission({ phoneNumber: ["create"] });
  const nextCalls: unknown[] = [];

  await middleware(
    {
      auth: {
        userId: "user_123",
        activeOrganizationId: "org_123",
        authMethod: "apiKey",
        session: null,
        apiKeyPermissions: { phoneNumber: ["create"] },
      },
      headers: {},
    } as any,
    {} as any,
    (error?: unknown) => {
      nextCalls.push(error);
    }
  );

  assert.deepEqual(nextCalls, [undefined]);
});

test("requirePermission denies unknown route permissions even when an API key has wildcard access", async () => {
  const middleware = requirePermission({ imaginaryResource: ["read"] });
  const errors: unknown[] = [];

  await middleware(
    {
      auth: {
        userId: "user_123",
        activeOrganizationId: "org_123",
        authMethod: "apiKey",
        session: null,
        apiKeyPermissions: { "*": ["*"] },
      },
      headers: {},
    } as any,
    {} as any,
    (error?: unknown) => {
      errors.push(error);
    }
  );

  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ForbiddenError);
  assert.match((errors[0] as Error).message, /Unknown permission requested/);
});

test("requirePermission denies unknown actions on registered resources", async () => {
  const middleware = requirePermission({ phoneNumber: ["publish"] });
  const errors: unknown[] = [];

  await middleware(
    {
      auth: {
        userId: "user_123",
        activeOrganizationId: "org_123",
        authMethod: "apiKey",
        session: null,
        apiKeyPermissions: { "*": ["*"] },
      },
      headers: {},
    } as any,
    {} as any,
    (error?: unknown) => {
      errors.push(error);
    }
  );

  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ForbiddenError);
  assert.match((errors[0] as Error).message, /Unknown permission requested/);
});
