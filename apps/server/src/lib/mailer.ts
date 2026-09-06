import nodemailer from "nodemailer";
import {
  contactEmailAddressSchema,
  type ContactSubmission,
} from "../modules/contact/contact.schema.js";

export const CONTACT_DELIVERY_TIMEOUT_MS = 8_000;

type AuthEmailType = "verifyEmail" | "resetPassword";

interface EmailContent {
  subject: string;
  heading: string;
  intro: string;
  action: string;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required email environment variable: ${name}`);
  }
  return value;
}

function getZeptoMailToken() {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) {
    throw new Error(
      "Missing required email environment variable: ZEPTOMAIL_TOKEN",
    );
  }
  const trimmedToken = token.trim();
  if (/^zoho-enczapikey\s+/i.test(trimmedToken)) {
    return trimmedToken;
  }
  return `zoho-enczapikey ${trimmedToken}`;
}

function getZeptoMailEndpoint() {
  const rawUrl =
    process.env.ZEPTOMAIL_URL || process.env.SMTP_HOST || "api.zeptomail.com";

  const urlWithProtocol = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;
  const endpoint = new URL(urlWithProtocol);

  if (endpoint.hostname.startsWith("smtp.zeptomail.")) {
    endpoint.hostname = endpoint.hostname.replace(/^smtp\./, "api.");
  }

  const path = endpoint.pathname.replace(/\/+$/, "");
  if (!path) {
    endpoint.pathname = "/v1.1/email";
  } else if (path === "/v1.1") {
    endpoint.pathname = "/v1.1/email";
  } else {
    endpoint.pathname = path;
  }

  endpoint.search = "";
  endpoint.hash = "";

  return endpoint.toString();
}

function getSmtpPort() {
  const rawPort = process.env.SMTP_PORT || "587";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port)) {
    throw new Error("Invalid email environment variable: SMTP_PORT");
  }
  return port;
}

function getSmtpTransport(timeoutMs?: number) {
  const port = getSmtpPort();
  return nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: {
      user: requireEnv("SMTP_USERNAME"),
      pass: requireEnv("SMTP_PASSWORD"),
    },
    ...(timeoutMs
      ? {
          connectionTimeout: timeoutMs,
          greetingTimeout: timeoutMs,
          socketTimeout: timeoutMs,
          dnsTimeout: timeoutMs,
        }
      : {}),
  });
}

async function withDeliveryTimeout<T>(
  send: (signal?: AbortSignal) => Promise<T>,
  timeoutMs?: number,
  close?: () => void,
): Promise<T> {
  if (!timeoutMs) return send();

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Email provider timed out; delivery status is unknown"));
      controller.abort();
      close?.();
    }, timeoutMs);
  });
  try {
    return await Promise.race([send(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function contentFor(type: AuthEmailType): EmailContent {
  if (type === "verifyEmail") {
    return {
      subject: "Verify your QuickVoice email",
      heading: "Verify your email",
      intro:
        "Confirm your email address to finish setting up your QuickVoice account.",
      action: "Verify email",
    };
  }

  return {
    subject: "Reset your QuickVoice password",
    heading: "Reset your password",
    intro: "Use this secure link to reset your QuickVoice password.",
    action: "Reset password",
  };
}

function buildText(content: EmailContent, url: string, fullName: string) {
  return [
    `Hi ${fullName || "there"},`,
    "",
    content.intro,
    "",
    `${content.action}: ${url}`,
  ].join("\n");
}

function buildHtml(content: EmailContent, url: string, fullName: string) {
  const safeName = escapeHtml(fullName || "there");
  const safeUrl = escapeHtml(url);

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:32px;">${escapeHtml(content.heading)}</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:24px;">Hi ${safeName},</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:24px;">${escapeHtml(content.intro)}</p>
                <p style="margin:0 0 24px;">
                  <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:700;">${escapeHtml(content.action)}</a>
                </p>
                <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;">If the button does not work, paste this link into your browser:</p>
                <p style="margin:0;font-size:14px;line-height:22px;word-break:break-all;color:#4b5563;">${safeUrl}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendEmail(
  type: AuthEmailType,
  email: string,
  url: string,
  fullName: string,
) {
  const content = contentFor(type);
  return sendComposedEmail({
    email,
    fullName,
    subject: content.subject,
    text: buildText(content, url, fullName),
    html: buildHtml(content, url, fullName),
    failureLabel: type,
  });
}

export async function sendNumberBillingNotice(args: {
  email: string;
  fullName: string;
  phoneNumber: string;
  chargeDate: Date;
  priceUsd: string;
}) {
  const billingUrl = `${(
    process.env.CONSOLE_URL?.split(",")[0]?.trim() || "http://localhost:3000"
  ).replace(/\/+$/, "")}/settings/billing`;
  const date = args.chargeDate.toISOString().slice(0, 10);
  const subject = "Your QuickVoice number moves to prepaid billing in 7 days";
  const text = [
    `Hi ${args.fullName || "there"},`,
    "",
    `Your QuickVoice number ${args.phoneNumber} will renew for ${args.priceUsd} every 30 days, starting ${date}.`,
    "Promotional credit cannot be used for phone number rentals.",
    "Add paid credit or enable automatic reload to keep the number.",
    "",
    `Manage billing: ${billingUrl}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827"><h1>Phone number billing starts in 7 days</h1><p>Hi ${escapeHtml(args.fullName || "there")},</p><p>Your QuickVoice number <strong>${escapeHtml(args.phoneNumber)}</strong> will renew for <strong>${escapeHtml(args.priceUsd)}</strong> every 30 days, starting ${escapeHtml(date)}.</p><p>Promotional credit cannot be used for phone number rentals. Add paid credit or enable automatic reload to keep the number.</p><p><a href="${escapeHtml(billingUrl)}">Manage billing</a></p></body></html>`;
  return sendComposedEmail({
    email: args.email,
    fullName: args.fullName,
    subject,
    text,
    html,
    failureLabel: "phone number billing notice",
  });
}

export async function sendContactSubmission(submission: ContactSubmission) {
  const recipient = contactEmailAddressSchema.parse(
    process.env.CONTACT_RECIPIENT_EMAIL?.trim() || "info@quickvoice.co",
  );
  const replyTo = contactEmailAddressSchema.parse(submission.email);
  const fields: Array<[string, string]> = [
    ["Name", submission.name],
    ["Email", replyTo],
    ["Company", submission.company || "Not provided"],
    ["Phone", submission.phone || "Not provided"],
    ["Looking for", submission.lookingFor],
    ["Submitted at", submission.submittedAt],
    ["Source", submission.source],
    ["Message", submission.message],
  ];
  const text = fields
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n\n");
  const html = `<!doctype html><html><body><h1>New website enquiry</h1>${fields.map(([label, value]) => `<h2>${escapeHtml(label)}</h2><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(value)}</pre>`).join("")}</body></html>`;

  return sendComposedEmail({
    email: recipient,
    fullName: "QuickVoice team",
    subject: "New QuickVoice website enquiry",
    text,
    html,
    replyTo,
    timeoutMs: CONTACT_DELIVERY_TIMEOUT_MS,
    requireRecipientAcceptance: true,
    failureLabel: "website contact",
  });
}

async function sendComposedEmail(args: {
  email: string;
  fullName: string;
  subject: string;
  text: string;
  html: string;
  failureLabel: string;
  replyTo?: string;
  timeoutMs?: number;
  requireRecipientAcceptance?: boolean;
}) {
  const fromEmail = requireEnv("FROM_EMAIL");
  const fromName = "Console|Quickvoice";

  const payload = {
    from: {
      address: fromEmail,
      name: fromName,
    },
    to: [
      {
        email_address: {
          address: args.email,
          name: args.fullName,
        },
      },
    ],
    subject: args.subject,
    textbody: args.text,
    htmlbody: args.html,
    ...(args.replyTo ? { reply_to: [{ address: args.replyTo }] } : {}),
  };

  if (process.env.ZEPTOMAIL_TOKEN) {
    try {
      await withDeliveryTimeout(async (signal) => {
        const response = await fetch(getZeptoMailEndpoint(), {
          method: "POST",
          headers: {
            Authorization: getZeptoMailToken(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          ...(signal ? { signal } : {}),
        });
        const body = await response.text();

        if (!response.ok) {
          throw new Error(
            `ZeptoMail responded with ${response.status} ${response.statusText}: ${body}`,
          );
        }
        return response;
      }, args.timeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to send ${args.failureLabel} email via ZeptoMail: ${message}`,
      );
    }
    return;
  }

  try {
    const transport = getSmtpTransport(args.timeoutMs);
    const result = await withDeliveryTimeout(
      () =>
        transport.sendMail({
          from: {
            address: fromEmail,
            name: fromName,
          },
          to: [
            {
              address: args.email,
              name: args.fullName,
            },
          ],
          subject: args.subject,
          text: args.text,
          html: args.html,
          ...(args.replyTo ? { replyTo: { address: args.replyTo } } : {}),
        }),
      args.timeoutMs,
      () => transport.close(),
    );
    if (
      args.requireRecipientAcceptance &&
      !result.accepted?.some(
        (value) =>
          (typeof value === "string" ? value : value.address).toLowerCase() ===
          args.email.toLowerCase(),
      )
    ) {
      throw new Error("SMTP did not acknowledge the contact recipient");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to send ${args.failureLabel} email via SMTP: ${message}`,
    );
  }
}
