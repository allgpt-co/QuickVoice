import Stripe from "stripe";

export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-06-24.dahlia";

export const isStripeConfigured = Boolean(
  process.env.STRIPE_SECRET_KEY?.trim(),
);

// Stripe is an optional integration. A non-secret inert key lets the API boot
// and report `not_configured` readiness without making billing calls usable.
export const stripeClient = new Stripe(
  process.env.STRIPE_SECRET_KEY?.trim() ?? "sk_test_quickvoice_not_configured",
  {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  },
);
