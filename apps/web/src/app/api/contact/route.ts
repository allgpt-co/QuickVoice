import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import {
  normalizeEnquiryContext,
  submissionIdentifier,
  type EnquiryContext,
} from "../../../lib/enquiry-context.mjs";
import {
  validateContactFields,
  type ContactFields,
} from "../../../lib/contact-validation.mjs";

export const runtime = "nodejs";

const MAX_CONTACT_REQUEST_BYTES = 24 * 1024;
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

class ContactRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface ContactSubmission extends ContactFields {
  source: string;
  submittedAt: string;
  submissionId?: string;
  formLocation?: "homepage" | "contact_page";
  attribution?: EnquiryContext;
}

async function forwardSubmission(
  submission: ContactSubmission,
  webhookUrl: string,
  clientFingerprint: string,
) {
  const secret = process.env.CONTACT_WEBHOOK_SECRET?.trim();
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-QuickVoice-Contact-Client": clientFingerprint,
      ...(secret ? { "X-QuickVoice-Contact-Secret": secret } : {}),
    },
    // Do not carry the shared credential to a redirected destination.
    ...(secret ? { redirect: "error" as const } : {}),
    body: JSON.stringify(submission),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Contact webhook failed with status ${response.status}`);
  }
}

async function readContactJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new ContactRequestError(415, "Content-Type must be application/json");
  }

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_CONTACT_REQUEST_BYTES)
  ) {
    throw new ContactRequestError(413, "Contact submission is too large");
  }

  if (!request.body) {
    throw new ContactRequestError(400, "Invalid JSON payload");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_CONTACT_REQUEST_BYTES) {
        await reader.cancel();
        throw new ContactRequestError(413, "Contact submission is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ContactRequestError) throw error;
    throw new ContactRequestError(400, "Invalid JSON payload");
  } finally {
    reader.releaseLock();
  }
}

function visitorAddress(request: NextRequest) {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function clientFingerprint(request: NextRequest) {
  const key =
    process.env.CONTACT_CLIENT_FINGERPRINT_SECRET?.trim() ||
    process.env.CONTACT_WEBHOOK_SECRET?.trim() ||
    process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!key) {
    throw new ContactRequestError(
      503,
      "Contact verification is temporarily unavailable",
    );
  }
  return createHmac("sha256", key)
    .update(visitorAddress(request))
    .digest("hex");
}

async function verifyTurnstile(token: unknown, request: NextRequest) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    throw new ContactRequestError(
      503,
      "Contact verification is temporarily unavailable",
    );
  }
  if (typeof token !== "string" || !token || token.length > 2048) {
    throw new ContactRequestError(400, "Complete the verification challenge");
  }

  let response: Response;
  try {
    const verificationBody = new URLSearchParams({
      secret,
      response: token,
    });
    const remoteAddress = visitorAddress(request);
    if (remoteAddress !== "unknown") {
      verificationBody.set("remoteip", remoteAddress);
    }
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verificationBody,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new ContactRequestError(
      503,
      "Contact verification is temporarily unavailable",
    );
  }

  if (!response.ok) {
    throw new ContactRequestError(
      503,
      "Contact verification is temporarily unavailable",
    );
  }

  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  const allowedHostnames = new Set(
    (
      process.env.TURNSTILE_EXPECTED_HOSTNAMES ||
      "quickvoice.co,www.quickvoice.co"
    )
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
  if (
    result.success !== true ||
    result.action !== "contact" ||
    !result.hostname ||
    !allowedHostnames.has(result.hostname.toLowerCase())
  ) {
    throw new ContactRequestError(403, "Verification failed. Please try again");
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await readContactJson(request);
  } catch (error) {
    const failure =
      error instanceof ContactRequestError
        ? error
        : new ContactRequestError(400, "Invalid JSON payload");
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }

  const parsed = validateContactFields(body);
  const firstError = Object.values(parsed.errors)[0];
  if (firstError) {
    return NextResponse.json(
      { error: firstError, fieldErrors: parsed.errors },
      { status: 400 },
    );
  }

  const webhookUrl = process.env.CONTACT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json(
      {
        error:
          "Contact delivery is temporarily unavailable. Please email info@quickvoice.co directly.",
      },
      { status: 503 },
    );
  }

  const context = body as Record<string, unknown>;
  if (context.website) {
    return NextResponse.json(
      { error: "Invalid contact submission" },
      { status: 400 },
    );
  }
  const formStartedAt = Number(context.formStartedAt);
  const elapsed = Date.now() - formStartedAt;
  if (
    !Number.isFinite(formStartedAt) ||
    elapsed < 2_000 ||
    elapsed > 2 * 60 * 60 * 1_000
  ) {
    return NextResponse.json(
      { error: "Refresh the form and try again" },
      { status: 400 },
    );
  }

  try {
    await verifyTurnstile(context.turnstileToken, request);
  } catch (error) {
    const failure =
      error instanceof ContactRequestError
        ? error
        : new ContactRequestError(403, "Verification failed. Please try again");
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }

  // The existing API receiver is strict. Opt in only after its compatible
  // optional-field schema is deployed; default forwarding remains unchanged.
  const extended = process.env.CONTACT_ATTRIBUTION_ENABLED === "true";
  const submissionId = extended
    ? (submissionIdentifier(context.submissionId) ?? randomUUID())
    : undefined;
  const formLocation =
    typeof context.formLocation === "string" &&
    ["homepage", "contact_page"].includes(context.formLocation)
      ? (context.formLocation as "homepage" | "contact_page")
      : undefined;

  try {
    await forwardSubmission(
      {
        ...parsed.fields,
        source: "quickvoice-web-contact",
        submittedAt: new Date().toISOString(),
        ...(extended
          ? {
              submissionId,
              formLocation,
              attribution: normalizeEnquiryContext(context.attribution),
            }
          : {}),
      },
      webhookUrl,
      clientFingerprint(request),
    );
  } catch {
    // Do not log submitted personal data, webhook URLs, or provider responses.
    console.error("Contact submission delivery failed");
    return NextResponse.json(
      {
        error:
          "We could not deliver your request. Please email info@quickvoice.co directly.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...(submissionId ? { submissionId } : {}),
    message:
      "Thank you. Your inquiry has been submitted to the QuickVoice team.",
  });
}
