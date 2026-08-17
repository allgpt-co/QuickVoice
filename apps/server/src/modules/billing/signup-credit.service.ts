import { createHmac } from "node:crypto";

import prisma from "../../config/prisma.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import {
  ensureBillingAccount,
  grantSignupPromotionalCredit,
} from "./wallet-ledger.service.js";

export type SignupCreditResult =
  | {
      granted: boolean;
      reason:
        | "self_hosted"
        | "launch_not_configured"
        | "not_eligible"
        | "no_organization"
        | "not_first_organization";
    }
  | { granted: boolean; reason: "eligible"; organizationId: string };

/**
 * Grants the one-time $5 usage-only signup credit after email verification.
 * Eligibility is tied to the user creation timestamp, not the time a later
 * organization happens to be created, so pre-launch accounts cannot backfill
 * the promotion by creating a new organization.
 */
export async function maybeGrantSignupCredit(args: {
  userId: string;
  organizationId?: string;
}): Promise<SignupCreditResult> {
  if (!isHostedBilling) return { granted: false, reason: "self_hosted" };
  const launchAt = signupPromotionLaunchAt();
  if (!launchAt) return { granted: false, reason: "launch_not_configured" };

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { id: true, email: true, emailVerified: true, createdAt: true },
  });
  if (!user?.emailVerified || user.createdAt < launchAt) {
    return { granted: false, reason: "not_eligible" };
  }

  // Promotional money belongs to the signup's own new workspace. An invitee
  // must never add repeated $5 grants to an older/shared organization.
  const firstMembership = await prisma.member.findFirst({
    where: {
      userId: user.id,
      role: "owner",
      organization: { createdAt: { gte: launchAt } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { organizationId: true },
  });
  if (!firstMembership) return { granted: false, reason: "no_organization" };
  if (
    args.organizationId &&
    args.organizationId !== firstMembership.organizationId
  ) {
    return { granted: false, reason: "not_first_organization" };
  }

  await ensureBillingAccount(firstMembership.organizationId);
  const result = await grantSignupPromotionalCredit({
    organizationId: firstMembership.organizationId,
    userId: user.id,
    identityHash: promotionalIdentityHash(user.email),
    reason: "verified_signup",
    metadata: {
      promotion: "signup_5_usd",
      launchAt: launchAt.toISOString(),
      restrictions: ["call_usage_only", "not_phone_numbers"],
    },
  });
  return {
    granted: result.granted,
    reason: "eligible",
    organizationId: firstMembership.organizationId,
  };
}

export function promotionalIdentityHash(email: string) {
  const secret = process.env.PROMOTIONAL_IDENTITY_SECRET?.trim();
  if (!secret) {
    throw new Error("PROMOTIONAL_IDENTITY_SECRET is required in hosted mode");
  }
  return createHmac("sha256", secret)
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export function signupPromotionLaunchAt(): Date | null {
  const raw = process.env.BILLING_PROMO_START_AT?.trim();
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}
