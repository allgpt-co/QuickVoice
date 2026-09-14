import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

process.env.NODE_ENV = "test";
process.env.SERVER_URL = "http://localhost:5000";
process.env.BETTER_AUTH_SECRET =
  "signup-test-secret-with-adequate-length-32chars";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";

const { auth } = await import("../../src/lib/auth.js");
const { default: prisma } = await import("../../src/config/prisma.js");
const context = await auth.$context;
const submission = {
  name: "Signup Test",
  email: "registered@example.com",
  password: "test-password-123",
};
const existingUser = {
  id: "existing-user",
  name: "Existing User",
  email: submission.email,
  emailVerified: false,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-01T00:00:00Z"),
};

function mockUserLookup(t: TestContext, user: { id: string } | null) {
  // Prisma delegates use a proxy, so Node's descriptor-based mock.method cannot wrap them.
  const original = prisma.user.findUnique;
  const lookup = t.mock.fn(async (_args: unknown) => user);
  prisma.user.findUnique = lookup as unknown as typeof original;
  t.after(() => {
    prisma.user.findUnique = original;
  });
  return lookup;
}

function signUp(body: unknown = submission) {
  return auth.handler(
    new Request(`${context.baseURL}/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

for (const emailVerified of [false, true]) {
  test(`signup rejects an existing ${emailVerified ? "verified" : "unverified"} email, including different casing`, async (t) => {
    const lookup = mockUserLookup(t, { id: existingUser.id });
    t.mock.method(context.internalAdapter, "findUserByEmail", async () => ({
      user: { ...existingUser, emailVerified },
      accounts: [],
    }));
    const create = t.mock.method(context.internalAdapter, "createUser");
    const hash = t.mock.method(
      context.password,
      "hash",
      async () => "test-hash",
    );
    const send = t.mock.method(
      context.options.emailVerification!,
      "sendVerificationEmail",
      async () => {},
    );

    for (const email of [submission.email, "Registered@EXAMPLE.com"]) {
      const response = await signUp({ ...submission, email });
      assert.equal(response.status, 400);
      assert.ok(
        response.headers.get("content-type")?.includes("application/json"),
      );
      assert.equal(
        (await response.json()).message,
        "An account with this email address already exists",
      );
      assert.equal(response.headers.get("set-cookie"), null);
    }
    assert.equal(lookup.mock.callCount(), 2);
    for (const call of lookup.mock.calls) {
      assert.deepEqual(call.arguments, [
        { where: { email: submission.email }, select: { id: true } },
      ]);
    }
    assert.equal(create.mock.callCount(), 0);
    assert.equal(hash.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
  });
}

test("signup still creates a new user and sends email verification", async (t) => {
  const lookup = mockUserLookup(t, null);
  t.mock.method(context.internalAdapter, "findUserByEmail", async () => null);
  const newUser = { ...existingUser, id: "new-user", email: "new@example.com" };
  const create = t.mock.method(
    context.internalAdapter,
    "createUser",
    async () => newUser,
  );
  const link = t.mock.method(
    context.internalAdapter,
    "linkAccount",
    async () => ({}),
  );
  t.mock.method(context.password, "hash", async () => "test-hash");
  const send = t.mock.method(
    context.options.emailVerification!,
    "sendVerificationEmail",
    async () => {},
  );

  const response = await signUp({ ...submission, email: "New@EXAMPLE.com" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.id, newUser.id);
  assert.equal(body.user.email, newUser.email);
  assert.equal(body.user.emailVerified, false);
  assert.equal(body.token, null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(lookup.mock.calls[0]!.arguments, [
    { where: { email: newUser.email }, select: { id: true } },
  ]);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(create.mock.calls[0]!.arguments[0].email, newUser.email);
  assert.equal(link.mock.callCount(), 1);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(send.mock.calls[0]!.arguments[0].user.email, newUser.email);
});

test("signup rejects missing or non-string emails without a database lookup", async (t) => {
  const lookup = mockUserLookup(t, null);
  for (const email of [undefined, null, 123, { address: submission.email }]) {
    assert.equal((await signUp({ ...submission, email })).status, 400);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test("other auth endpoints do not run the signup email lookup", async (t) => {
  const lookup = mockUserLookup(t, null);
  const response = await auth.handler(
    new Request(`${context.baseURL}/get-session`),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
  assert.equal(lookup.mock.callCount(), 0);
});
