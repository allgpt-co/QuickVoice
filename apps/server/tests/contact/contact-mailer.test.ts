import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import nodemailer from "nodemailer";

import {
  CONTACT_DELIVERY_TIMEOUT_MS,
  sendContactSubmission,
} from "../../src/lib/mailer.js";
import type { ContactSubmission } from "../../src/modules/contact/contact.schema.js";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

const submission: ContactSubmission = {
  name: "Contact Test",
  email: "visitor@example.com",
  company: "",
  phone: "",
  lookingFor: "Evaluation",
  message: "Please discuss a test evaluation.",
  source: "quickvoice-web-contact",
  submittedAt: "2026-09-06T12:00:00.000Z",
};

function setSmtpEnv() {
  delete process.env.ZEPTOMAIL_TOKEN;
  delete process.env.CONTACT_RECIPIENT_EMAIL;
  process.env.FROM_EMAIL = "verified@example.com";
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_USERNAME = "test-user";
  process.env.SMTP_PASSWORD = "test-password";
}

test("contact SMTP keeps the sender fixed and accepts only its configured recipient", async (t) => {
  setSmtpEnv();
  process.env.CONTACT_RECIPIENT_EMAIL = "selfhost@example.com";
  let sent: nodemailer.SendMailOptions | undefined;
  let options: Record<string, unknown> | undefined;
  t.mock.method(nodemailer, "createTransport", ((
    config: Record<string, unknown>,
  ) => {
    options = config;
    return {
      sendMail: async (message: nodemailer.SendMailOptions) => {
        sent = message;
        return { accepted: ["selfhost@example.com"] };
      },
      close: () => {},
    };
  }) as typeof nodemailer.createTransport);
  await sendContactSubmission(submission);
  assert.deepEqual(sent?.from, {
    address: "verified@example.com",
    name: "Console|Quickvoice",
  });
  assert.deepEqual(sent?.to, [
    { address: "selfhost@example.com", name: "QuickVoice team" },
  ]);
  assert.deepEqual(sent?.replyTo, { address: "visitor@example.com" });
  for (const setting of [
    "connectionTimeout",
    "greetingTimeout",
    "socketTimeout",
    "dnsTimeout",
  ]) {
    assert.equal(options?.[setting], CONTACT_DELIVERY_TIMEOUT_MS);
  }
  assert.ok(CONTACT_DELIVERY_TIMEOUT_MS < 10_000);
});

test("invalid configured recipients and Reply-To fail before invoking a mail provider", async (t) => {
  setSmtpEnv();
  const transport = t.mock.method(nodemailer, "createTransport", (() => {
    throw new Error("Must not send");
  }) as typeof nodemailer.createTransport);
  process.env.CONTACT_RECIPIENT_EMAIL = "one@example.com,two@example.com";
  await assert.rejects(sendContactSubmission(submission));
  delete process.env.CONTACT_RECIPIENT_EMAIL;
  await assert.rejects(
    sendContactSubmission({
      ...submission,
      email: "visitor@example.com\r\nBcc: other@example.com",
    }),
  );
  assert.equal(transport.mock.callCount(), 0);
});

test("a resolved SMTP operation with no accepted recipient is a failed delivery", async (t) => {
  setSmtpEnv();
  t.mock.method(nodemailer, "createTransport", (() => ({
    sendMail: async () => ({ accepted: [], rejected: ["info@quickvoice.co"] }),
    close: () => {},
  })) as unknown as typeof nodemailer.createTransport);
  await assert.rejects(
    sendContactSubmission(submission),
    /SMTP did not acknowledge/,
  );
});

test("SMTP wait is bounded below the web deadline and never retries an ambiguous send", async (t) => {
  setSmtpEnv();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  let closed = 0;
  t.mock.method(nodemailer, "createTransport", (() => ({
    sendMail: async () => {
      attempts++;
      return new Promise(() => {});
    },
    close: () => {
      closed++;
    },
  })) as unknown as typeof nodemailer.createTransport);
  const pending = sendContactSubmission(submission);
  const rejected = assert.rejects(
    pending,
    /timed out; delivery status is unknown/,
  );
  t.mock.timers.tick(CONTACT_DELIVERY_TIMEOUT_MS);
  await rejected;
  assert.equal(attempts, 1);
  assert.equal(closed, 1);
});

test("ZeptoMail timeout aborts its one request without retrying or falling back to SMTP", async (t) => {
  setSmtpEnv();
  process.env.ZEPTOMAIL_TOKEN = "test-token";
  process.env.ZEPTOMAIL_URL = "https://api.zeptomail.com";
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | null | undefined;
  const fetch = t.mock.method(globalThis, "fetch", async (_url, init) => {
    signal = init?.signal;
    return new Promise<Response>(() => {});
  });
  const transport = t.mock.method(nodemailer, "createTransport", (() => {
    throw new Error("No fallback");
  }) as typeof nodemailer.createTransport);
  const pending = sendContactSubmission(submission);
  const rejected = assert.rejects(
    pending,
    /timed out; delivery status is unknown/,
  );
  t.mock.timers.tick(CONTACT_DELIVERY_TIMEOUT_MS);
  await rejected;
  assert.equal(signal?.aborted, true);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(transport.mock.callCount(), 0);
});
