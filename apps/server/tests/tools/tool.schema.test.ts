import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createToolSchema,
  updateToolSchema,
} from "../../src/modules/tools/tool.schema.js";

test("tool creation still applies creation defaults", () => {
  const parsed = createToolSchema.parse({
    name: "Lookup",
    description: "Look up a record",
    api_url: "https://api.example.com/lookup",
  });

  assert.equal(parsed.api_method, "POST");
  assert.equal(parsed.disable_interruptions, false);
  assert.equal(parsed.force_pre_tool_speech, true);
});

test("tool PATCH preserves every omitted field", () => {
  assert.deepEqual(updateToolSchema.parse({ name: "Renamed lookup" }), {
    name: "Renamed lookup",
  });
});

test("tool PATCH rejects an empty body", () => {
  assert.equal(updateToolSchema.safeParse({}).success, false);
});

test("tool PATCH accepts explicit method and speech changes", () => {
  assert.deepEqual(
    updateToolSchema.parse({
      api_method: "GET",
      disable_interruptions: true,
      force_pre_tool_speech: false,
    }),
    {
      api_method: "GET",
      disable_interruptions: true,
      force_pre_tool_speech: false,
    },
  );
});

test("tool inputs recursively reject internal encrypted envelopes", () => {
  const parsed = createToolSchema.safeParse({
    name: "Lookup",
    description: "Look up a record",
    api_url: "https://api.example.com/lookup",
    api_body: [
      {
        name: "customer_id",
        type: "String",
        valueType: "Static Value",
        value: "qvsec:v1:leaked-ciphertext",
        description: "Customer identifier",
      },
    ],
  });

  assert.equal(parsed.success, false);
});
