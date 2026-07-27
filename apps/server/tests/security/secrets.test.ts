import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  decryptSecretValue,
  encryptSecretValue,
  encryptSecretFields,
  redactSecretFields,
  restoreRedactedSecretReferences,
  resolveSecretFields,
} from "../../src/lib/secrets.js";
import { getSecretReferenceIds } from "../../src/modules/secrets/secret-store.service.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

test("secret values are stored as encrypted envelopes and can be resolved for runtime use", () => {
  process.env.SECRET_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const encrypted = encryptSecretValue("sk_live_secret");

  assert.notEqual(encrypted, "sk_live_secret");
  assert.match(encrypted, /^qvsec:v1:/);
  assert.equal(decryptSecretValue(encrypted), "sk_live_secret");
});

test("integration secret encryption does not fall back to auth credentials", () => {
  delete process.env.SECRET_ENCRYPTION_KEY;
  process.env.BETTER_AUTH_SECRET =
    "test-auth-secret-that-must-not-encrypt-integrations";
  process.env.INTERNAL_API_KEY =
    "test-internal-secret-that-must-not-encrypt-integrations";

  assert.throws(
    () => encryptSecretValue("sensitive"),
    /SECRET_ENCRYPTION_KEY is required/,
  );
});

test("secret-marked webhook fields are encrypted for storage, redacted for reads, and resolved for runtime", () => {
  process.env.SECRET_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const input = {
    webhook_url: "https://example.com/hook",
    method: "POST",
    headers: {
      Authorization: { type: "Secret", value: "Bearer token" },
      "X-Mode": { type: "Value", value: "test" },
    },
    body: {
      apiKey: { type: "Secret", value: "body-secret" },
    },
  };

  const encrypted = encryptSecretFields(input);

  assert.match(encrypted.headers.Authorization.value, /^qvsec:v1:/);
  assert.equal(encrypted.headers["X-Mode"].value, "test");

  assert.deepEqual(redactSecretFields(encrypted).headers.Authorization, {
    type: "Secret",
    value: null,
    redacted: true,
  });
  assert.equal(
    resolveSecretFields(encrypted).headers.Authorization.value,
    "Bearer token",
  );
  assert.equal(resolveSecretFields(encrypted).body.apiKey.value, "body-secret");
});

test("redacted updates preserve stored references while explicit replacements win", () => {
  const existing = [
    { key: "Authorization", value: "qvsecret:secret-1" },
    { key: "X-Token", value: "qvsecret:secret-2" },
  ];

  assert.deepEqual(
    restoreRedactedSecretReferences(
      [
        {
          key: "X-Token",
          value: "",
          redacted: true,
        },
        {
          key: "Authorization",
          value: "replacement",
          redacted: false,
        },
      ],
      existing,
    ),
    [
      { key: "X-Token", value: "qvsecret:secret-2" },
      { key: "Authorization", value: "replacement" },
    ],
  );

  assert.throws(
    () =>
      restoreRedactedSecretReferences(
        { value: null, type: "Secret", redacted: true },
        null,
      ),
    /no longer has a stored value/,
  );
});

test("secret reference collection is recursive and deduplicated", () => {
  assert.deepEqual(
    getSecretReferenceIds(
      {
        headers: [
          { key: "Authorization", value: "qvsecret:secret-1" },
          { key: "X-Mode", value: "plain" },
        ],
      },
      {
        body: {
          token: { type: "Secret", value: "qvsecret:secret-2" },
          repeated: "qvsecret:secret-1",
        },
      },
    ).sort(),
    ["secret-1", "secret-2"],
  );
});
