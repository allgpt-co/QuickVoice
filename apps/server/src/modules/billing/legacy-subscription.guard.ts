import type { RequestHandler } from "express";

export const BLOCKED_LEGACY_SUBSCRIPTION_MUTATIONS = [
  "/subscription/upgrade",
  "/subscription/restore",
  "/subscription/billing-portal",
] as const;

export const rejectLegacySubscriptionMutation: RequestHandler = (_req, res) => {
  res.status(409).json({
    success: false,
    code: "PREPAID_BILLING_REQUIRED",
    message: "Plans have been replaced by prepaid wallet billing",
  });
};
