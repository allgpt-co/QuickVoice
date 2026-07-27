import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

export const stripeClient = stripeSecretKey && !stripeSecretKey.startsWith("sk_test_dev_placeholder")
  ? new Stripe(stripeSecretKey)
  : null;