import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeToolSecretDestinationUpdate, assertSafeWebhookSecretDestinationUpdate } from "../../src/modules/tools/tool-secret-destination.js";

const existing = {
  api_url: "https://api.vendor.example/v1/orders",
  api_headers: [
    { key: "Authorization", value: "qvsecret:authorization-secret" },
  ],
  dynamic_variables: null,
};

test("blocks moving retained tool secrets to another origin", () => {
  assert.throws(
    () =>
      assertSafeToolSecretDestinationUpdate(existing, {
        api_url: "https://attacker.example/collect",
      }),
    /requires replacing or removing its saved secrets/,
  );

  assert.throws(
    () =>
      assertSafeToolSecretDestinationUpdate(existing, {
        api_url: "https://attacker.example/collect",
        api_headers: [
          { key: "Authorization", value: null, redacted: true },
        ],
      }),
    /requires replacing or removing its saved secrets/,
  );

  assert.throws(
    () =>
      assertSafeToolSecretDestinationUpdate(
        {
          ...existing,
          api_headers: [{ key: "X-Legacy-Key", value: "legacy plaintext" }],
        },
        { api_url: "https://attacker.example/collect" },
      ),
    /requires replacing or removing its saved secrets/,
  );
});

test("allows same-origin URL edits without re-entering secrets", () => {
  assert.doesNotThrow(() =>
    assertSafeToolSecretDestinationUpdate(existing, {
      api_url: "https://api.vendor.example/v2/orders",
    }),
  );
});

test("allows a new origin when stored secrets are replaced or removed", () => {
  assert.doesNotThrow(() =>
    assertSafeToolSecretDestinationUpdate(existing, {
      api_url: "https://replacement.example/orders",
      api_headers: [{ key: "Authorization", value: "new credential" }],
    }),
  );

  assert.doesNotThrow(() =>
    assertSafeToolSecretDestinationUpdate(existing, {
      api_url: "https://replacement.example/orders",
      api_headers: null,
    }),
  );
});

test("requires replacement of every secret-bearing tool field", () => {
  const withDynamicSecret = {
    ...existing,
    dynamic_variables: [
      { key: "customer_token", value: "qvsec:v1:encrypted" },
    ],
  };

  assert.throws(
    () =>
      assertSafeToolSecretDestinationUpdate(withDynamicSecret, {
        api_url: "https://replacement.example/orders",
        api_headers: null,
      }),
    /requires replacing or removing its saved secrets/,
  );
});

test("webhook origin changes cannot retain header or body secrets", () => {
  for (const field of ["headers", "body"]) {
    const existing = { webhook_url: "https://vendor.example/hook", [field]: {
      token: { type: "Secret", value: "qvsecret:saved" },
    } };
    const edited = { webhook_url: "https://other.example/hook", [field]: {
      token: { type: "Secret", value: null, redacted: true },
    } };
    assert.throws(() => assertSafeWebhookSecretDestinationUpdate(existing, edited), /webhook origin/);
    assert.throws(() => assertSafeWebhookSecretDestinationUpdate(existing, {
      ...edited, [field]: { token: { type: "Secret", value: "qvsecret:saved" } },
    }), /webhook origin/);
    assert.doesNotThrow(() => assertSafeWebhookSecretDestinationUpdate(existing, {
      ...edited, webhook_url: "https://vendor.example/new-path",
    }));
    assert.doesNotThrow(() => assertSafeWebhookSecretDestinationUpdate(existing, {
      webhook_url: "https://other.example/hook",
    }));
    assert.doesNotThrow(() => assertSafeWebhookSecretDestinationUpdate(existing, {
      ...edited, [field]: { token: { type: "Secret", value: "replacement" } },
    }));
  }
});
