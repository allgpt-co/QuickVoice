import { NextRequest, NextResponse } from "next/server";
import {
  validateContactFields,
  type ContactFields,
} from "../../../lib/contact-validation.mjs";

export const runtime = "nodejs";

interface ContactSubmission extends ContactFields {
  source: string;
  submittedAt: string;
}

async function forwardSubmission(
  submission: ContactSubmission,
  webhookUrl: string,
) {
  const secret = process.env.CONTACT_WEBHOOK_SECRET?.trim();
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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

  try {
    await forwardSubmission(
      {
        ...parsed.fields,
        source: "quickvoice-web-contact",
        submittedAt: new Date().toISOString(),
      },
      webhookUrl,
    );
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
