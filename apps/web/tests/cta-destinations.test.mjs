import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsDestination,
  matchesAnalyticsDestination,
} from "../src/lib/cta-destinations.mjs";

const origin = "https://quickvoice.co";
const booking = "https://tidycal.com/team/quickvoice/demo";

test("CTA classification requires the correct origin and complete path", () => {
  assert.equal(
    matchesAnalyticsDestination(
      "/company/contact?source=pricing#enquiry",
      "/company/contact",
      origin,
    ),
    true,
  );
  assert.equal(
    matchesAnalyticsDestination(
      `${booking}/?email=private@example.com`,
      booking,
      origin,
    ),
    true,
  );
  assert.equal(
    matchesAnalyticsDestination(
      "https://other.example/team/quickvoice/demo",
      booking,
      origin,
    ),
    false,
  );
  assert.equal(
    matchesAnalyticsDestination("/team/quickvoice/demo", booking, origin),
    false,
  );
  assert.equal(
    matchesAnalyticsDestination(
      "https://other.example/register",
      "https://app.quickvoice.co/register",
      origin,
    ),
    false,
  );
  assert.equal(
    matchesAnalyticsDestination(`${booking}/confirmed`, booking, origin),
    false,
  );
});

test("analytics destinations omit visitor query and hash values and reject unusable URLs", () => {
  assert.equal(
    analyticsDestination(`${booking}?email=private@example.com#secret`, origin),
    booking,
  );
  assert.equal(
    analyticsDestination("/company/contact?phone=123", origin),
    `${origin}/company/contact`,
  );
  for (const value of [
    "mailto:private@example.com",
    "tel:+123456789",
    "javascript:alert(1)",
    "https://user:password@quickvoice.co/company/contact",
    "https://[",
  ]) {
    assert.equal(analyticsDestination(value, origin), null);
    assert.equal(matchesAnalyticsDestination(value, value, origin), false);
  }
});
