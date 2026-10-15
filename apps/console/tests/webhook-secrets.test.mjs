import assert from "node:assert/strict";
import test from "node:test";
import {
  rowsForSecretFields,
  secretFieldsFromRows,
} from "../src/components/agents/webhook-secret-fields.ts";

test("a redacted webhook secret survives a form round trip", () => {
  const rows = rowsForSecretFields({
    Authorization: { value: null, type: "Secret", redacted: true },
  });
  assert.deepEqual(secretFieldsFromRows(rows), {
    Authorization: { value: null, type: "Secret", redacted: true },
  });
  assert.deepEqual(secretFieldsFromRows([{ ...rows[0], value: "qvsecret:new", redacted: false }]), {
    Authorization: { value: "qvsecret:new", type: "Secret" },
  });
  assert.deepEqual(secretFieldsFromRows([]), {});
});
