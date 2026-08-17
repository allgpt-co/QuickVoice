import prisma from "../../config/prisma.js";
import { redisConnection } from "../../config/redis.js";
import { evaluateReadiness, type ReadinessCheck } from "./readiness-policy.js";
import { billingMode, isHostedBilling } from "../../config/billing-mode.js";

export async function getReadiness() {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
  const checks = {
    db,
    redis,
    auth: checkEnv(
      ["BETTER_AUTH_SECRET"],
      "Better Auth secret is not configured",
    ),
    internalApi: checkEnv(
      ["INTERNAL_API_KEY"],
      "Internal API key is not configured",
    ),
    secrets: checkEnv(
      ["SECRET_ENCRYPTION_KEY"],
      "Secret encryption key is not configured",
    ),
    s3: checkEnv(
      ["S3_BUCKET_NAME", "BUCKET_NAME", "BUCKET"],
      "S3 bucket is not configured",
    ),
    stripe: checkEnv(
      ["STRIPE_SECRET_KEY"],
      "Stripe secret key is not configured",
    ),
    stripeWebhook: checkEnv(
      ["STRIPE_WEBHOOK_SECRET"],
      "Legacy subscription webhook secret is not configured",
    ),
    stripeWalletWebhook: checkEnv(
      ["STRIPE_WALLET_WEBHOOK_SECRET"],
      "Stripe wallet webhook secret is not configured",
    ),
    stripeTax: checkStripeTaxConfiguration(),
    consoleUrl: checkEnv(
      ["CONSOLE_URL"],
      "Console URL is required for hosted Checkout return links",
    ),
    billingScheduler: checkEnv(
      ["INNGEST_SIGNING_KEY"],
      "Inngest signing key is required for billing maintenance schedules",
    ),
    telnyxBillingCurrency: checkExactEnv(
      "TELNYX_BILLING_CURRENCY",
      "USD",
      "Telnyx billing currency must be explicitly configured as USD",
    ),
    billingPromotion: checkValidDateEnv(
      "BILLING_PROMO_START_AT",
      "Signup promotion launch timestamp is not configured or invalid",
    ),
    billingPromotionIdentity: checkEnv(
      ["PROMOTIONAL_IDENTITY_SECRET"],
      "Promotion identity hashing secret is not configured",
    ),
    numberQuoteSigning: checkEnv(
      ["NUMBER_QUOTE_SIGNING_SECRET"],
      "Phone number quote signing secret is not configured",
    ),
    billingMode: { status: "ok" as const, message: billingMode },
    twilio: checkEnv(
      ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_TRUNK_SID"],
      "Twilio credentials or trunk are not configured",
      "all",
    ),
    livekit: checkEnv(
      [
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "LIVEKIT_SIP_INBOUND_TRUNK_ID",
      ],
      "LiveKit URL, API credentials, or inbound trunk are not configured",
      "all",
    ),
    livekitTwilio: checkEnv(
      ["LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID"],
      "LiveKit Twilio outbound trunk is not configured",
      "all",
    ),
    telnyx: checkEnv(
      ["TELNYX_API_KEY", "TELNYX_CONNECTION_ID"],
      "Telnyx credentials or connection are not configured",
      "all",
    ),
    livekitTelnyx: checkEnv(
      ["LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID"],
      "LiveKit Telnyx outbound trunk is not configured",
      "all",
    ),
    smithery: checkEnv(
      ["SMITHERY_API_KEY"],
      "Smithery API key is not configured",
    ),
  };

  return evaluateReadiness(
    checks,
    [
      process.env.READINESS_REQUIRED_INTEGRATIONS,
      ...(isHostedBilling
        ? [
            "stripe",
            "stripeWebhook",
            "stripeWalletWebhook",
            "stripeTax",
            "consoleUrl",
            "billingScheduler",
            "telnyxBillingCurrency",
            "internalApi",
            "billingPromotion",
            "billingPromotionIdentity",
            "numberQuoteSigning",
          ]
        : []),
    ]
      .filter(Boolean)
      .join(","),
  );
}

function checkStripeTaxConfiguration(): ReadinessCheck {
  if (process.env.STRIPE_AUTOMATIC_TAX_ENABLED !== "true") {
    return { status: "ok", message: "disabled" };
  }
  return checkEnv(
    ["STRIPE_WALLET_TAX_CODE"],
    "Stripe wallet tax code is required when Automatic Tax is enabled",
  );
}

function checkExactEnv(
  name: string,
  expected: string,
  message: string,
): ReadinessCheck {
  return process.env[name]?.trim().toUpperCase() === expected.toUpperCase()
    ? { status: "ok" }
    : { status: "not_configured", message };
}

function checkValidDateEnv(name: string, message: string): ReadinessCheck {
  const raw = process.env[name]?.trim();
  if (!raw) return { status: "not_configured", message };
  return Number.isNaN(new Date(raw).getTime())
    ? { status: "error", message }
    : { status: "ok" };
}

async function checkDb(): Promise<ReadinessCheck> {
  try {
    await withTimeout(prisma.$queryRawUnsafe("SELECT 1"), 2000);
    return { status: "ok" };
  } catch {
    return {
      status: "error",
      message: "Database connectivity check failed",
    };
  }
}

async function checkRedis(): Promise<ReadinessCheck> {
  try {
    await withTimeout(redisConnection.ping(), 2000);
    return { status: "ok" };
  } catch {
    return {
      status: "error",
      message: "Redis connectivity check failed",
    };
  }
}

function checkEnv(
  names: string[],
  message: string,
  mode: "any" | "all" = "any",
): ReadinessCheck {
  const isConfigured =
    mode === "all"
      ? names.every((name) => Boolean(process.env[name]?.trim()))
      : names.some((name) => Boolean(process.env[name]?.trim()));

  return isConfigured
    ? { status: "ok" }
    : { status: "not_configured", message };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("readiness check timed out")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
