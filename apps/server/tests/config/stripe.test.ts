import assert from "node:assert/strict";
import { test } from "node:test";

import { STRIPE_API_VERSION, stripeClient } from "../../src/config/stripe.js";

test("Stripe uses the API version bundled with the installed SDK", () => {
  assert.equal(STRIPE_API_VERSION, "2026-06-24.dahlia");
  assert.equal(stripeClient.getApiField("version"), STRIPE_API_VERSION);
});
