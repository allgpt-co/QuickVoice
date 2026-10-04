import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalPromotionalEmail,
  promotionalIdentityHash,
} from "../../src/modules/billing/signup-credit.service.js";

test("signup promotion canonicalizes Gmail dots, tags, and googlemail aliases", () => {
  const aliases = [
    "User.Name@gmail.com",
    "username@gmail.com",
    "u.s.e.r.n.a.m.e+trial@googlemail.com",
    "username+another@gmail.com",
  ];

  assert.deepEqual(
    aliases.map(canonicalPromotionalEmail),
    aliases.map(() => "username@gmail.com"),
  );
});

test("signup promotion strips plus tags without applying Gmail dot rules to other domains", () => {
  assert.equal(
    canonicalPromotionalEmail("member+trial@example.com"),
    "member@example.com",
  );
  assert.notEqual(
    canonicalPromotionalEmail("first.last@example.com"),
    canonicalPromotionalEmail("firstlast@example.com"),
  );
});

test("promotion hashes use the canonical email identity", () => {
  const previousSecret = process.env.PROMOTIONAL_IDENTITY_SECRET;
  process.env.PROMOTIONAL_IDENTITY_SECRET = "signup-alias-regression-secret";
  try {
    assert.equal(
      promotionalIdentityHash("user.name+trial@gmail.com"),
      promotionalIdentityHash("username@googlemail.com"),
    );
    assert.notEqual(
      promotionalIdentityHash("first.last@example.com"),
      promotionalIdentityHash("firstlast@example.com"),
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.PROMOTIONAL_IDENTITY_SECRET;
    } else {
      process.env.PROMOTIONAL_IDENTITY_SECRET = previousSecret;
    }
  }
});
