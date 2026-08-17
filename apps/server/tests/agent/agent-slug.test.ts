import assert from "node:assert/strict";
import { test } from "node:test";

import { generateSlug } from "../../src/common/utils/generateSlug.js";
import { createAgentSchema } from "../../src/modules/agent/agent.schema.js";

test("agent slugs are deterministic and normalize equivalent names", () => {
  assert.equal(generateSlug("Cafe Support"), "cafe-support");
  assert.equal(generateSlug("Café   Support!"), "cafe-support");
  assert.equal(generateSlug("  Sales---Team  "), "sales-team");
  assert.equal(generateSlug("---Sales Team---"), "sales-team");
});

test("agent slugs have a stable fallback when a name has no ASCII word characters", () => {
  assert.equal(generateSlug("☎️☎️"), "agent");
});

test("agent names are trimmed and bounded before persistence", () => {
  assert.equal(
    createAgentSchema.parse({
      name: "  Sales assistant  ",
      isActive: true,
      templateId: null,
    }).name,
    "Sales assistant",
  );
  assert.throws(() =>
    createAgentSchema.parse({
      name: "a".repeat(101),
      isActive: true,
      templateId: null,
    }),
  );
});
