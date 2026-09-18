import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEnquiryContext,
  observeEnquiryContext,
  publicLandingPath,
  submissionIdentifier,
} from "../src/lib/enquiry-context.mjs";

test("enquiry context strips queries, fragments and non-public paths", () => {
  assert.equal(publicLandingPath("/blog/vapi-alternatives?email=person@example.com#contact"), "/blog/vapi-alternatives");
  for (const path of ["https://other.test/blog/example", "/users/person@example.com", "/api/contact", "//evil.test", "/blog/%65mail", "/blog/" + "a".repeat(180)]) {
    assert.equal(publicLandingPath(path), "/other");
  }
  assert.equal(publicLandingPath("/use-cases/appointment-scheduling/"), "/use-cases/appointment-scheduling");
});

test("classifies only coarse observed sources, never raw referral/query values", () => {
  const context = observeEnquiryContext("https://quickvoice.co/blog/vapi-alternatives?email=secret@example.com", "https://www.google.com/search?q=private+search");
  assert.deepEqual(context, { landingPage: "/blog/vapi-alternatives", source: "google", medium: "organic", method: "browser_observed" });
  assert.equal(JSON.stringify(context).includes("secret"), false);
  assert.equal(observeEnquiryContext("https://quickvoice.co/pricing", "https://github.com/allgpt-co/QuickVoice").source, "github");
  assert.equal(observeEnquiryContext("https://quickvoice.co/", "https://chatgpt.com/c/private").medium, "ai_assistant");
  assert.equal(observeEnquiryContext("https://quickvoice.co/").medium, "direct");
  assert.equal(observeEnquiryContext("https://quickvoice.co/", "https://google.com.attacker.test/path").medium, "referral");
});

test("paid identifiers and campaign-tagged visits cannot silently become organic", () => {
  for (const query of ["gclid=private", "gbraid=private", "wbraid=private", "msclkid=private"]) {
    assert.equal(observeEnquiryContext(`https://quickvoice.co/?${query}`, "https://www.google.com/").medium, "paid");
  }
  for (const query of ["utm_source=private", "UTM_campaign=private", "utm_medium=cpc", "utm_medium=email"]) {
    const context = observeEnquiryContext(`https://quickvoice.co/?${query}`, "https://www.google.com/");
    assert.equal(context.medium, "unknown");
    assert.equal(JSON.stringify(context).includes("private"), false);
  }
});

test("full internal document navigation without original context is unknown", () => {
  for (const referrer of ["https://quickvoice.co/blog/vapi-alternatives", "https://www.quickvoice.co/", "https://app.quickvoice.co/", "https://console.quickvoice.co/", "https://docs.quickvoice.co/"]) {
    assert.equal(observeEnquiryContext("https://quickvoice.co/company/contact", referrer).source, "unknown");
  }
});

test("normalization drops arbitrary data and identifiers must be UUID v4", () => {
  assert.equal(normalizeEnquiryContext({ method: "verified", email: "person@example.com" }), undefined);
  assert.deepEqual(normalizeEnquiryContext({ method: "browser_observed", source: "person@example.com", medium: "email", landingPage: "/pricing?phone=123", email: "person@example.com" }), {
    method: "browser_observed", source: "unknown", medium: "unknown", landingPage: "/pricing",
  });
  assert.equal(submissionIdentifier("894c976a-b9cd-487c-9e6d-fc0ce42f9143"), "894c976a-b9cd-487c-9e6d-fc0ce42f9143");
  for (const value of ["person@example.com", "not-an-id", 123, "894c976a-b9cd-187c-9e6d-fc0ce42f9143"]) assert.equal(submissionIdentifier(value), undefined);
});
