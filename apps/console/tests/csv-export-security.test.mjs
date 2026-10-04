import assert from "node:assert/strict";
import { test } from "node:test";

import { serializeCsvRows } from "../src/lib/export-csv.ts";

test("CSV exports neutralize formulas and quote carriage returns", () => {
  assert.equal(
    serializeCsvRows([
      ["value", "notes"],
      ["=HYPERLINK(\"https://evil.example\")", "first\rsecond"],
      ["+15551230000", "@SUM(1+1)"],
      [-42, "-2+3"],
    ]),
    [
      "value,notes",
      "\"'=HYPERLINK(\"\"https://evil.example\"\")\",\"first\rsecond\"",
      "+15551230000,'@SUM(1+1)",
      "-42,'-2+3",
    ].join("\n"),
  );
});


test("CSV preserves international phone numbers without allowing formula suffixes", () => {
  for (const phone of ["+15551230000", "+919876543210", "+442079460123", "+123456789012345"]) {
    assert.equal(serializeCsvRows([[phone]]), phone);
  }
  for (const unsafe of ["+15551230000+1", "+SUM(1+1)", "+1e10",
     "+15551230000\t", "+15551230000\n=1+1", "=1+1", "-2+3", "@SUM(1+1)"]) {
    assert.match(serializeCsvRows([[unsafe]]), /^"?'/, unsafe);
  }
  assert.equal(serializeCsvRows([["+15551230000\r"]]), `"'+15551230000\r"`);
  assert.equal(serializeCsvRows([["+15551230000\n"]]), `"'+15551230000\n"`);
});

test("plain signed numeric strings round-trip without apostrophes", () => {
  for (const value of ["+0123456789", "+1234567890123456", "-42", "+1.25", "-0.5", "0"]) {
    assert.equal(serializeCsvRows([[value]]), value);
  }
});
