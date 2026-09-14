import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import nodemailer from "nodemailer";
import * as mailer from "../../src/lib/mailer.js";
import * as permissions from "../../src/lib/permissions.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalTransport = nodemailer.createTransport;
afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  nodemailer.createTransport = originalTransport;
});

// Capture the actual application plugin configuration without connecting to Prisma,
// Stripe, or billing. Exercise its endpoints using Better Auth's memory adapter.
function invitationConfig() {
  let hooks: Parameters<typeof betterAuth>[0]["hooks"];
  let options: Parameters<typeof organization>[0];
  const noop = () => {};
  const mocks: Record<string, unknown> = {
    "better-auth": { APIError, betterAuth: (value: Parameters<typeof betterAuth>[0]) => { hooks = value.hooks; } },
    "better-auth/api": { createAuthMiddleware },
    "better-auth/adapters/prisma": { prismaAdapter: noop },
    "better-auth/plugins": { admin: noop, organization: (value: typeof options) => { options = value; } },
    "@better-auth/api-key": { apiKey: noop },
    "@better-auth/stripe": { stripe: noop },
    "./mailer.js": mailer,
    "./permissions.js": permissions,
    "../modules/billing/wallet-ledger.service.js": { ensureBillingAccount: noop },
    "../modules/billing/signup-credit.service.js": { maybeGrantSignupCredit: noop },
  };
  const source = ts.transpileModule(readFileSync(new URL("../../src/lib/auth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: {}, process, console: { error: noop },
    require: (name: string) => mocks[name] ?? {},
  });
  assert.ok(hooks?.after, "Invitation delivery must be wired into auth");
  assert.equal(options?.requireEmailVerificationOnInvitation, true);
  return { hooks, plugins: [organization(options)] };
}

function emailEnv() {
  process.env.CONSOLE_URL = "https://console.quickvoice.co/,https://preview.quickvoice.co";
  process.env.FROM_EMAIL = "no-reply@mail.quickvoice.co";
  process.env.ZEPTOMAIL_URL = "https://api.zeptomail.in";
  process.env.ZEPTOMAIL_TOKEN = "test-only-token";
}

const inviteEmail = {
  invitationId: "invite&role=owner",
  email: "recipient@example.com",
  role: "member",
  workspaceName: '<img src=x onerror="alert(1)">',
  inviterName: "Owner & team",
  expiresAt: new Date("2030-09-16T12:00:00Z"),
};

test("workspace emails use the frontend URL and escape workspace content", async () => {
  emailEnv();
  let payload: Record<string, any> = {};
  globalThis.fetch = (async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  await mailer.sendWorkspaceInvitation(inviteEmail);
  assert.equal(payload.to[0].email_address.address, inviteEmail.email);
  assert.match(payload.textbody, /https:\/\/console.quickvoice.co\/accept-invitation\?invitationId=invite%26role%3Downer/);
  assert.match(payload.htmlbody, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(payload.htmlbody, /<img/);
  assert.match(payload.textbody, /member/);
  assert.match(payload.textbody, /16 Sep 2030/);
  delete process.env.CONSOLE_URL;
  await assert.rejects(mailer.sendWorkspaceInvitation(inviteEmail), /CONSOLE_URL/);
});

test("SMTP invitation delivery requires provider acceptance and propagates rejection", async () => {
  emailEnv();
  delete process.env.ZEPTOMAIL_TOKEN;
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_USERNAME = "test-user";
  process.env.SMTP_PASSWORD = "test-only-password";
  let accepted = false;
  nodemailer.createTransport = (() => ({
    sendMail: async () => ({ accepted: accepted ? [inviteEmail.email] : [], rejected: accepted ? [] : [inviteEmail.email] }),
    close() {},
  })) as typeof nodemailer.createTransport;
  await assert.rejects(mailer.sendWorkspaceInvitation(inviteEmail), /SMTP did not acknowledge/);
  accepted = true;
  await mailer.sendWorkspaceInvitation(inviteEmail);
});

test("real invitation endpoints send, retry, enforce recipient verification, and grant only the invited role", async () => {
  emailEnv();
  let failDelivery = true;
  const messages: Record<string, any>[] = [];
  globalThis.fetch = (async (_url, init) => {
    messages.push(JSON.parse(String(init?.body)));
    return new Response(failDelivery ? "provider-private-error" : "{}", { status: failDelivery ? 503 : 200 });
  }) as typeof fetch;
  const db: Record<string, any[]> = { user: [], session: [], account: [], verification: [], organization: [], member: [], invitation: [], organizationRole: [] };
  const auth = betterAuth({
    baseURL: "http://localhost:5000",
    secret: "test-only-invitations-secret-32-characters",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    ...invitationConfig(),
    logger: { disabled: true },
  });
  async function account(email: string, verified = true) {
    const result = await auth.api.signUpEmail({
      body: { name: "QA teammate", email, password: "test-only-password-123" }, returnHeaders: true,
    });
    const user = db.user.find((user) => user.email === email)!;
    user.emailVerified = verified;
    return new Headers({ cookie: result.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ") });
  }
  const owner = await account("owner@example.com");
  const recipient = await account("recipient@example.com", false);
  const stranger = await account("stranger@example.com");
  const org = await auth.api.createOrganization({ headers: owner, body: { name: "QA workspace", slug: "qa-workspace" } });
  assert.ok(org);
  const body = { organizationId: org.id, email: "recipient@example.com", role: "member" as const };
  await assert.rejects(auth.api.createInvitation({ headers: owner, body }), (error: any) => {
    assert.equal(error.status, "SERVICE_UNAVAILABLE");
    assert.match(error.body.message, /Retry using Resend/);
    assert.doesNotMatch(error.body.message, /provider-private-error/);
    return true;
  });
  assert.equal(db.invitation.length, 1);
  const invitationId = db.invitation[0].id;
  assert.equal(db.invitation[0].status, "pending");
  failDelivery = false;
  const resent = await auth.api.createInvitation({ headers: owner, body: { ...body, resend: true } });
  assert.equal(resent.id, invitationId);
  assert.equal(db.invitation.length, 1);
  assert.equal(messages.length, 2);
  assert.match(messages[1].textbody, new RegExp(`/accept-invitation\\?invitationId=${invitationId}`));
  await assert.rejects(auth.api.acceptInvitation({ headers: stranger, body: { invitationId } }), /not the recipient/i);
  await assert.rejects(auth.api.acceptInvitation({ headers: recipient, body: { invitationId } }), /verification/i);
  db.user.find((user) => user.email === body.email)!.emailVerified = true;
  const review = await auth.api.getInvitation({ headers: recipient, query: { id: invitationId } });
  assert.equal(review.organizationName, org.name);
  assert.equal(db.member.length, 1, "Reviewing an invitation must not accept it");
  const accepted = await auth.api.acceptInvitation({ headers: recipient, body: { invitationId } });
  assert.equal(accepted.member.role, "member");
  assert.equal(accepted.member.organizationId, org.id);
  assert.equal(db.member.length, 2);
  await assert.rejects(auth.api.acceptInvitation({ headers: recipient, body: { invitationId } }), /invitation not found/i);

  const expiredRecipient = await account("expired@example.com");
  const expired = await auth.api.createInvitation({ headers: owner, body: { ...body, email: "expired@example.com" } });
  db.invitation.find((invitation) => invitation.id === expired.id)!.expiresAt = new Date(0);
  await assert.rejects(auth.api.acceptInvitation({ headers: expiredRecipient, body: { invitationId: expired.id } }), /invitation not found/i);
  const renewed = await auth.api.createInvitation({ headers: owner, body: { ...body, email: "expired@example.com", resend: true } });
  await auth.api.cancelInvitation({ headers: owner, body: { invitationId: renewed.id } });
  await assert.rejects(auth.api.acceptInvitation({ headers: expiredRecipient, body: { invitationId: renewed.id } }), /invitation not found/i);
  assert.equal(db.member.length, 2);
});
