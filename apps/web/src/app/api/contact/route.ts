import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+]?[1-9][\d\s().-]{3,24}$/;

interface ContactSubmission {
  name: string;
  email: string;
  company: string;
  phone: string;
  lookingFor: string;
  message: string;
  source: string;
  submittedAt: string;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseSubmission(body: unknown):
  | { ok: true; submission: ContactSubmission }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request payload" };
  }

  const data = body as Record<string, unknown>;
  const name = cleanString(data.name, 120);
  const email = cleanString(data.email, 254).toLowerCase();
  const company = cleanString(data.company, 160);
  const phone = cleanString(data.phone, 40);
  const lookingFor = cleanString(data.lookingFor, 120);
  const message = cleanString(data.message, 5000);

  if (name.length < 2) {
    return { ok: false, error: "Full name is required" };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "A valid email address is required" };
  }

  if (!lookingFor) {
    return { ok: false, error: "Please select what you are looking for" };
  }

  if (message.length < 10) {
    return { ok: false, error: "Message must be at least 10 characters" };
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    return { ok: false, error: "Please enter a valid phone number" };
  }

  return {
    ok: true,
    submission: {
      name,
      email,
      company,
      phone,
      lookingFor,
      message,
      source: "quickvoice-web-contact",
      submittedAt: new Date().toISOString(),
    },
  };
}

async function forwardSubmission(submission: ContactSubmission, webhookUrl: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Contact webhook failed with status ${response.status}`);
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const parsed = parseSubmission(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const webhookUrl = process.env.CONTACT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Contact delivery is temporarily unavailable. Please email info@quickvoice.co directly." },
      { status: 503 },
    );
  }

  try {
    await forwardSubmission(parsed.submission, webhookUrl);
  } catch (error) {
    console.error("Contact submission delivery failed", error);
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
    message: "Thank you. Your inquiry was delivered to the QuickVoice team.",
  });
}
