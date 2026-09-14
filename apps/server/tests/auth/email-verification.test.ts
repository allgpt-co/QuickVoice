import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createEmailVerificationToken } from "better-auth/api";

process.env.NODE_ENV = "test";
process.env.SERVER_URL = "http://localhost:5000";
process.env.CONSOLE_URL = "http://localhost:3000/";
process.env.BETTER_AUTH_SECRET =
  "verification-test-secret-with-adequate-length-32chars";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";

const { auth } = await import("../../src/lib/auth.js");
const context = await auth.$context;
const user = {
  id: "verification-user",
  name: "Verification Test",
  email: "verification@example.com",
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const session = {
  id: "verification-session",
  token: "verification-session-token",
  userId: user.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + 86_400_000),
  activeOrganizationId: null,
};

function mockVerification(t: TestContext, emailVerified = false) {
  const lookup = t.mock.method(
    context.internalAdapter,
    "findUserByEmail",
    async () => ({
      user: { ...user, emailVerified },
      accounts: [],
    }),
  );
  const update = t.mock.method(
    context.internalAdapter,
    "updateUserByEmail",
    async () => ({
      ...user,
      emailVerified: true,
    }),
  );
  const createSession = t.mock.method(
    context.internalAdapter,
    "createSession",
    async () => session,
  );
  return { lookup, update, createSession };
}

async function verify(callbackURL?: string, token?: string) {
  const url = new URL(`${context.baseURL}/verify-email`);
  url.searchParams.set(
    "token",
    token ?? (await createEmailVerificationToken(context.secret, user.email)),
  );
  if (callbackURL !== undefined)
    url.searchParams.set("callbackURL", callbackURL);
  return auth.handler(new Request(url));
}

for (const callback of [
  undefined,
  "",
  "/",
  "/login",
  "/verify",
  "http://localhost:3000/orgs",
]) {
  test(`verification signs in and redirects ${JSON.stringify(callback)} to console onboarding`, async (t) => {
    const mocks = mockVerification(t);
    const response = await verify(callback);
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3000/orgs?verified=true",
    );
    assert.match(
      response.headers.get("set-cookie") ?? "",
      /better-auth\.session_token=/,
    );
    assert.equal(mocks.createSession.mock.callCount(), 1);
    assert.deepEqual(mocks.update.mock.calls[0]!.arguments, [
      user.email,
      { emailVerified: true },
    ]);
  });
}

test("verification preserves an intended route, query parameters, and fragment", async (t) => {
  mockVerification(t);
  const response = await verify(
    "http://localhost:3000/orgs/create?invite=invite-123&verified=false&error=stale#workspace",
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/orgs/create?invite=invite-123&verified=true#workspace",
  );
});

test("verification preserves the dashboard destination for an active workspace", async (t) => {
  mockVerification(t);
  t.mock.method(context.internalAdapter, "createSession", async () => ({
    ...session,
    activeOrganizationId: "org-123",
  }));
  const response = await verify("http://localhost:3000/dashboard?from=email");
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/dashboard?from=email&verified=true",
  );
});

test("a dashboard callback without an active workspace retains success status on onboarding", async (t) => {
  mockVerification(t);
  const response = await verify("/dashboard");
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/orgs?verified=true",
  );
});

for (const expired of [false, true]) {
  test(`${expired ? "expired" : "invalid"} verification links redirect to login without success or a session`, async (t) => {
    const mocks = mockVerification(t);
    const token = expired
      ? await createEmailVerificationToken(
          context.secret,
          user.email,
          undefined,
          -60,
        )
      : "invalid-token";
    const response = await verify(
      "http://localhost:3000/orgs?verified=true#workspace",
      token,
    );
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      `http://localhost:3000/login?error=${expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN"}`,
    );
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(mocks.update.mock.callCount(), 0);
    assert.equal(mocks.createSession.mock.callCount(), 0);
  });
}

test("reopening a verified link without a session lands on login with success status", async (t) => {
  const mocks = mockVerification(t, true);
  const response = await verify("/login");
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/login?verified=true",
  );
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(mocks.update.mock.callCount(), 0);
  assert.equal(mocks.createSession.mock.callCount(), 0);
});

for (const callback of [
  "https://untrusted.example/dashboard",
  "//untrusted.example/dashboard",
  "/\\untrusted.example/dashboard",
  "javascript:alert(1)",
]) {
  test(`verification rejects an untrusted callback: ${callback}`, async (t) => {
    const mocks = mockVerification(t);
    const response = await verify(callback);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(mocks.update.mock.callCount(), 0);
    assert.equal(mocks.createSession.mock.callCount(), 0);
  });
}
