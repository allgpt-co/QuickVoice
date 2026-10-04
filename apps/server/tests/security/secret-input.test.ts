import assert from "node:assert/strict";
import { test } from "node:test";

import { createSecretSchema } from "../../src/modules/secrets/secret.schema.js";
import { createSecret } from "../../src/modules/secrets/secret.service.js";

test("direct secret input rejects internal encrypted envelopes", () => {
  assert.equal(
    createSecretSchema.safeParse({
      name: "provider-key",
      value: "qvsec:v1:leaked-ciphertext",
    }).success,
    false,
  );
  assert.equal(
    createSecretSchema.safeParse({
      name: "provider-key",
      value: "ordinary-secret-value",
    }).success,
    true,
  );
});

test("secret service rejects encrypted envelopes before persistence", async () => {
  await assert.rejects(
    createSecret({
      organizationId: "org_123",
      userId: "user_123",
      name: "provider-key",
      value: "qvsec:v1:leaked-ciphertext",
    }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 400);
      assert.match((error as Error).message, /cannot be submitted/);
      return true;
    },
  );
});
