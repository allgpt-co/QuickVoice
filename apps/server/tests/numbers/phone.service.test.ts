import assert from "node:assert/strict";
import { test } from "node:test";

import { TelephonyProvider } from "../../prisma/generated/prisma/client.js";
import { telnyxClient } from "../../src/config/telnyx.js";
import { searchAvailableNumbers } from "../../src/modules/numbers/phone.service.js";

test("Telnyx number search maps areaCode to national_destination_code", async (t) => {
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
