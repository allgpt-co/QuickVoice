export type BillingMode = "hosted" | "self_hosted";

function resolveBillingMode(): BillingMode {
  const configured = process.env.QUICKVOICE_BILLING_MODE?.trim().toLowerCase();
  if (configured === "hosted") return "hosted";
  if (configured === "self_hosted" || configured === "self-hosted") {
    return "self_hosted";
  }
  if (configured) {
    throw new Error(
      "QUICKVOICE_BILLING_MODE must be either 'hosted' or 'self_hosted'",
    );
  }

  // Production defaults to metered billing so a missing flag cannot silently
  // make the hosted service free. Local/community development remains
  // unmetered unless hosted mode is selected explicitly.
  return process.env.NODE_ENV === "production" ? "hosted" : "self_hosted";
}

export const billingMode = resolveBillingMode();
export const isHostedBilling = billingMode === "hosted";
