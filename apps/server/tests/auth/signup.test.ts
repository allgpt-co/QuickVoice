import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { memoryAdapter } from "better-auth/adapters/memory";

test("signup rejects existing emails without changing accounts and still verifies new users", async () => {
  let options: Parameters<typeof betterAuth>[0] | undefined;
  const noop = () => {};
  const messages: string[] = [];
  const mocks: Record<string, unknown> = {
    "better-auth": { APIError, betterAuth: (value: typeof options) => { options = value; } },
    "better-auth/api": { createAuthMiddleware },
    "better-auth/adapters/prisma": { prismaAdapter: noop },
    "better-auth/plugins": { admin: noop, organization: noop },
    "@better-auth/api-key": { apiKey: noop },
    "@better-auth/stripe": { stripe: noop },
    "./mailer.js": { sendEmail: async (_kind: string, email: string) => { messages.push(email); } },
    bcryptjs: { default: { hash: async (password: string) => `hashed:${password}`, compare: noop } },
  };
  const source = ts.transpileModule(readFileSync(new URL("../../src/lib/auth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: {}, process, console,
    require: (name: string) => mocks[name] ?? {},
  });
  assert.ok(options?.emailAndPassword);
  assert.ok(options.emailVerification);
  const db: Record<string, any[]> = { user: [], account: [], session: [], verification: [] };
  const auth = betterAuth({
    baseURL: "http://localhost:5000",
    secret: "test-only-signup-secret-at-least-32-characters",
    database: memoryAdapter(db),
    emailAndPassword: options.emailAndPassword,
    emailVerification: options.emailVerification,
    logger: { disabled: true },
  });
  const signup = (email: string, password = "original-password") => auth.handler(new Request(
    "http://localhost:5000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5000" },
      body: JSON.stringify({ name: "QA user", email, password }),
    },
  ));
  assert.equal((await signup("owner@example.com")).status, 200);
  assert.equal(db.user[0].emailVerified, false);
  assert.equal(db.session.length, 0);
  assert.deepEqual(messages, ["owner@example.com"]);
  for (const verified of [false, true]) {
    db.user[0].emailVerified = verified;
    const before = JSON.stringify(db);
    const response = await signup("OWNER@example.com", "replacement-password");
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.code, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    assert.match(body.message, /already registered.*sign in.*reset your password/i);
    assert.equal(JSON.stringify(db), before, "Duplicate signup must not change the existing user or password");
    assert.equal(messages.length, 1, "Duplicate signup must not send a new verification email");
  }
  assert.equal((await signup("new@example.com")).status, 200);
  assert.equal(db.user.length, 2);
  assert.deepEqual(messages, ["owner@example.com", "new@example.com"]);
});
