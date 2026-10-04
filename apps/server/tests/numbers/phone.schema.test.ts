import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buyNumberSchema,
  searchNumbersSchema,
} from "../../src/modules/numbers/phone.schema.js";

test("searchNumbersSchema accepts lowercase console provider and normalizes it", () => {
  const parsed = searchNumbersSchema.parse({
    provider: "twilio",
    country: "US",
    areaCode: "415",
    limit: "10",
  });

  assert.equal(parsed.provider, "TWILIO");
  assert.equal(parsed.country, "US");
  assert.equal(parsed.areaCode, 415);
  assert.equal(parsed.limit, 10);
});

test("searchNumbersSchema accepts uppercase provider", () => {
  const parsed = searchNumbersSchema.parse({
    provider: "TELNYX",
    country: "US",
    limit: "10",
  });

  assert.equal(parsed.provider, "TELNYX");
});

test("buyNumberSchema accepts lowercase console provider and normalizes it", () => {
  const parsed = buyNumberSchema.parse({
    provider: "telnyx",
    phoneNumber: "+14155551234",
  });

  assert.equal(parsed.provider, "TELNYX");
  assert.equal(parsed.phoneNumber, "+14155551234");
});

test("provider schemas reject unknown provider values", () => {
  assert.throws(
    () =>
      searchNumbersSchema.parse({
        provider: "bandwidth",
        country: "US",
      }),
    /Invalid option/
  );
});


test("country codes are normalized and reject non-letter input", () => {
  assert.equal(searchNumbersSchema.parse({ provider: "TWILIO", country: "us" }).country, "US");
  assert.equal(searchNumbersSchema.safeParse({ provider: "TWILIO", country: "12" }).success, false);
});
