import assert from "node:assert/strict";
import { test } from "node:test";

import { TelephonyProvider } from "../../prisma/generated/prisma/client.js";
import { telnyxClient } from "../../src/config/telnyx.js";
import { twilioClient } from "../../src/config/twilio.js";
import { listNumberCountries, searchAvailableNumbers } from "../../src/modules/numbers/phone.service.js";

test("Telnyx number search maps areaCode to national_destination_code", async (t) => {
  t.mock.method(telnyxClient.countryCoverage, "retrieve", async () => ({ data: {
    US: { code: "US", local: { features: ["voice"] } },
  } }));
  let query: Record<string, unknown> | undefined;
  const originalList = telnyxClient.availablePhoneNumbers.list;
  telnyxClient.availablePhoneNumbers.list = ((
    input: Record<string, unknown>,
  ) => {
    query = input;
    return Promise.resolve({ data: [] });
  }) as typeof telnyxClient.availablePhoneNumbers.list;
  t.after(() => {
    telnyxClient.availablePhoneNumbers.list = originalList;
  });

  const result = await searchAvailableNumbers(
    {
      provider: TelephonyProvider.TELNYX,
      country: "US",
      areaCode: 415,
      limit: 7,
    },
    "org_123",
  );

  assert.deepEqual(result, []);
  assert.deepEqual(query, {
    filter: {
      country_code: "US",
      national_destination_code: "415",
      phone_number_type: "local",
      features: ["voice"],
      limit: 7,
    },
  });
});


test("country discovery excludes Twilio toll-free-only countries and sorts names", async (t) => {
  t.mock.method(twilioClient.availablePhoneNumbers, "list", async () => [
    { countryCode: "US", country: "United States", subresourceUris: { local: "/local" } },
    { countryCode: "IN", country: "India", subresourceUris: { toll_free: "/toll-free" } },
    { countryCode: "CA", country: "Canada", subresourceUris: { local: "/local" } },
  ]);
  assert.deepEqual(await listNumberCountries(TelephonyProvider.TWILIO), [
    { code: "CA", name: "Canada" }, { code: "US", name: "United States" },
  ]);
  const inventory = t.mock.method(twilioClient, "request", async () => {
    throw new Error("Unsupported inventory must not be queried");
  });
  await assert.rejects(searchAvailableNumbers({ provider: TelephonyProvider.TWILIO, country: "IN" }, "org"),
    { statusCode: 400, code: "NUMBER_COUNTRY_NOT_SUPPORTED" });
  assert.equal(inventory.mock.callCount(), 0);
});

test("Telnyx countries require local voice coverage, not just country-level SMS or toll-free voice", async (t) => {
  t.mock.method(telnyxClient.countryCoverage, "retrieve", async () => ({ data: {
    US: { code: "US", local: { features: ["voice", "sms"] } },
    CA: { local: {}, features: ["voice"] },
    GB: { local: { features: ["sms"] }, features: ["voice"] },
    IN: { toll_free: { features: ["voice"] }, features: ["voice"] },
  } }));
  assert.deepEqual(await listNumberCountries(TelephonyProvider.TELNYX), [
    { code: "CA", name: "Canada" }, { code: "US", name: "United States" },
  ]);
});

test("provider failures are unavailable, not unsupported country errors", async (t) => {
  t.mock.method(twilioClient.availablePhoneNumbers, "list", async () => { throw new Error("credentials rejected"); });
  await assert.rejects(searchAvailableNumbers({ provider: TelephonyProvider.TWILIO, country: "IN" }, "org"),
    { statusCode: 503, code: "NUMBER_COUNTRIES_UNAVAILABLE" });
});

test("empty supported-country inventory does not fetch pricing or issue quotes", async (t) => {
  t.mock.method(twilioClient.availablePhoneNumbers, "list", async () => [
    { countryCode: "US", country: "United States", subresourceUris: { local: "/local" } },
  ]);
  const requests: string[] = [];
  t.mock.method(twilioClient, "request", async (options: { uri: string }) => {
    requests.push(options.uri);
    return { statusCode: 200, body: { available_phone_numbers: [], next_page_uri: null } };
  });
  assert.deepEqual(await searchAvailableNumbers({ provider: TelephonyProvider.TWILIO, country: "us" }, "org"), []);
  assert.equal(requests.length, 1);
  assert.match(requests[0]!, /AvailablePhoneNumbers\/US\/Local.json$/);

});
