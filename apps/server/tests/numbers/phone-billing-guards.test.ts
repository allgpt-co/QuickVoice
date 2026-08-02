import assert from "node:assert/strict";
import test from "node:test";

import { PhoneNumberBillingStatus } from "../../prisma/generated/prisma/client.js";
import { assertPhoneNumberCanLink } from "../../src/modules/numbers/phone-billing-guards.js";
import { isProviderNotFoundError } from "../../src/modules/numbers/provider-error.js";

test("only ACTIVE phone numbers can be newly linked", () => {
  assert.doesNotThrow(() =>
    assertPhoneNumberCanLink(PhoneNumberBillingStatus.ACTIVE, "agent-1"),
  );
  assert.throws(
    () =>
      assertPhoneNumberCanLink(PhoneNumberBillingStatus.SUSPENDED, "agent-1"),
    /Reactivate billing/,
  );
});

test("unlink remains available for non-active phone numbers", () => {
  for (const status of [
    PhoneNumberBillingStatus.SUSPENDED,
    PhoneNumberBillingStatus.RELEASE_PENDING,
    PhoneNumberBillingStatus.RELEASED,
  ]) {
    assert.doesNotThrow(() => assertPhoneNumberCanLink(status, null));
  }
});

test("provider not-found detection covers Telnyx HTTP and Twilio REST errors", () => {
  assert.equal(isProviderNotFoundError({ status: 404 }), true);
  assert.equal(isProviderNotFoundError({ statusCode: "404" }), true);
  assert.equal(isProviderNotFoundError({ code: 20404 }), true);
  assert.equal(isProviderNotFoundError({ status: 500 }), false);
});
