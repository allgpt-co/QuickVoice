import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

  // The existing API receiver is strict. Opt in only after its compatible
  // optional-field schema is deployed; default forwarding remains unchanged.
  const extended = process.env.CONTACT_ATTRIBUTION_ENABLED === "true";
  const context = body as Record<string, unknown>;
  const submissionId = extended
    ? submissionIdentifier(context.submissionId) ?? randomUUID()
    : undefined;
  const formLocation = typeof context.formLocation === "string" && ["homepage", "contact_page"].includes(context.formLocation)
    ? context.formLocation as "homepage" | "contact_page" : undefined;

  try {
    await forwardSubmission(
      {
        ...parsed.fields,
        source: "quickvoice-web-contact",
        submittedAt: new Date().toISOString(),
        ...(extended ? { submissionId, formLocation, attribution: normalizeEnquiryContext(context.attribution) } : {}),
      },
      webhookUrl,
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
    message: "Thank you. Your inquiry has been submitted to the QuickVoice team.",
  });
}
