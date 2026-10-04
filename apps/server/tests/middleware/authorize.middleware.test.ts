import assert from "node:assert/strict";
import { test } from "node:test";
import { APIError } from "better-auth";

process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder";
process.env.BETTER_AUTH_URL ||= "http://localhost:5000";
process.env.BETTER_AUTH_SECRET ||= "test-secret-with-adequate-length-32chars";
process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

const { ForbiddenError } = await import("../../src/common/errors/forbidden.js");
const { hasCurrentSessionPermission, hasSessionPermission, requirePermission } =
  await import("../../src/middleware/authorize.middleware.js");

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
    },
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
    },
  );

  assert.deepEqual(nextCalls, [undefined]);
});

test("read-only API keys cannot create billable preview sessions", async () => {
  const middleware = requirePermission({ agentPreview: ["create"] });
  const errors: unknown[] = [];

  await middleware(
    {
      auth: {
        userId: "user_123",
        activeOrganizationId: "org_123",
        authMethod: "apiKey",
        session: null,
        apiKeyPermissions: { agentConfiguration: ["read"] },
      },
      headers: {},
    } as any,
    {} as any,
    (error?: unknown) => {
      errors.push(error);
    },
  );

  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof ForbiddenError);
});

test("long-lived sessions lose permission after removal or an organization switch", async () => {
  const headers = {};
  const permissions = { callLogs: ["read"] };
  let permissionChecks = 0;
  const dependencies = {
    getSession: async () => ({
      user: { id: "user_123" },
      session: { activeOrganizationId: "org_123" },
    }),
    hasPermission: async () => {
      permissionChecks += 1;
      return false;
    },
  };

  assert.equal(
    await hasCurrentSessionPermission(
      headers,
      "user_123",
      "org_123",
      permissions,
      dependencies,
    ),
    false,
  );
  assert.equal(permissionChecks, 1, "removed membership must be rechecked");

  dependencies.getSession = async () => ({
    user: { id: "user_123" },
    session: { activeOrganizationId: "org_other" },
  });
  assert.equal(
    await hasCurrentSessionPermission(
      headers,
      "user_123",
      "org_123",
      permissions,
      dependencies,
    ),
    false,
  );
  assert.equal(
    permissionChecks,
    1,
    "an organization switch must fail before checking the stale organization",
  );
});


test("membership API errors deny both HTTP and long-lived session access", async (t) => {
  const { auth } = await import("../../src/lib/auth.js");
  t.mock.method(auth.api, "getSession", async () => ({
    user: { id: "user_123" }, session: { activeOrganizationId: "org_123" },
  }));
  for (const status of ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"] as const) {
    const mock = t.mock.method(auth.api, "hasPermission", async () => {
      throw new APIError(status, { message: "Membership removed" });
    });
    assert.equal(await hasSessionPermission({}, "org_123", { callLogs: ["read"] }), false);
    assert.equal(await hasCurrentSessionPermission({}, "user_123", "org_123", { callLogs: ["read"] }), false);
    const errors: unknown[] = [];
    await requirePermission({ callLogs: ["read"] })(
      { auth: { authMethod: "session", activeOrganizationId: "org_123" }, headers: {} } as any,
      {} as any, (error) => { errors.push(error); },
    );
    assert.ok(errors[0] instanceof ForbiddenError);
    mock.mock.restore();
  }
});

test("auth outages and throttling are not misclassified as membership denial", async (t) => {
  const { auth } = await import("../../src/lib/auth.js");
  for (const error of [new Error("database unavailable"), new APIError("INTERNAL_SERVER_ERROR"), new APIError("TOO_MANY_REQUESTS")]) {
    const mock = t.mock.method(auth.api, "hasPermission", async () => { throw error; });
    await assert.rejects(hasSessionPermission({}, "org_123", { callLogs: ["read"] }), (caught) => caught === error);
    mock.mock.restore();
  }
});
