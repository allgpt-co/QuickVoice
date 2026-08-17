import Stripe from "stripe";

let _stripeClient: Stripe | null = null;

export const stripeClient = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith("sk_test_dev_placeholder")) {
        // In dev without real Stripe credentials, defer the error to actual
        // billing-route usage rather than crashing on startup.
        console.warn(
          "[stripe] STRIPE_SECRET_KEY is not set — billing routes will be unavailable."
        );
        _stripeClient = new Stripe("sk_test_placeholder_00000000000000");
      } else {
        _stripeClient = new Stripe(key);
      }
    }
    const value = (_stripeClient as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(_stripeClient) : value;
  },
});