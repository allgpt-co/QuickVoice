import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { campaignScheduleToIso } from "../src/models/outbound/campaign-schedule.ts";
import { serializeCsvRows } from "../src/lib/export-csv.ts";

const require = createRequire(import.meta.url);
const cjsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL("../src/models/outbound/campaign.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, {
  exports: cjsModule.exports, File, Error,
  require: (name) => name === "./campaign-schedule" ? { campaignScheduleToIso }
    : name === "@/src/lib/export-csv" ? { serializeCsvRows } : require(name),
});
const { batchCampaignSchema } = cjsModule.exports;

/* eslint-disable turbo/no-undeclared-env-vars -- Test-only host timezone is varied and restored. */
test("T and space separators use the named timezone regardless of host timezone", () => {
  const previous = process.env.TZ;
  try {
    for (const host of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = host;
      for (const separator of ["T", " "]) {
        assert.equal(campaignScheduleToIso(`2026-10-01${separator}09:00`, "America/Chicago"), "2026-10-01T14:00:00.000Z");
      }
      assert.equal(campaignScheduleToIso("2026-10-01 09:00:01.123", "Asia/Kathmandu"), "2026-10-01T03:15:01.123Z");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

/* eslint-enable turbo/no-undeclared-env-vars */

test("impossible dates and malformed local times never roll over", () => {
  for (const value of ["2026-02-30T09:00", "2026-02-29T09:00", "2026-04-31T09:00",
    "2026-13-01T09:00", "2026-10-01T24:00", "2026-10-01T09:60", "2026-10-01T09:00:60",
    "2026-10-01", "2026-10-01T09:00Z", "2026-10-01T09:00-05:00", "2026-10-01T09:00\n"]) {
    assert.throws(() => campaignScheduleToIso(value, "UTC"), /valid/);
  }
  assert.equal(campaignScheduleToIso("2028-02-29T09:00", "UTC"), "2028-02-29T09:00:00.000Z");
  assert.throws(() => campaignScheduleToIso("2026-10-01T09:00", "Invalid/Zone"), /timezone/);
});

test("DST uses compatible disambiguation, including half-hour gaps and skipped days", () => {
  for (const [value, zone, expected] of [
    ["2026-03-08T02:30", "America/New_York", "2026-03-08T07:30:00.000Z"],
    ["2026-11-01T01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-10-04T02:15", "Australia/Lord_Howe", "2026-10-03T15:45:00.000Z"],
    ["2026-04-05T01:45", "Australia/Lord_Howe", "2026-04-04T14:45:00.000Z"],
    ["2011-12-30T12:00", "Pacific/Apia", "2011-12-30T22:00:00.000Z"],
  ]) assert.equal(campaignScheduleToIso(value, zone), expected);
});

test("form validation produces UTC before upload and exposes schedule errors", () => {
  const input = {
    name: "Test", agentId: "8d55565f-1111-4111-8111-f95fd03f0df2", fromNumber: "+15551230000",
    file: new File(["phone_number"], "calls.csv"), scheduleMode: "later",
    scheduledAt: "2026-10-01 09:00", timezone: "America/Chicago", ringingTimeoutSeconds: 60,
  };
  assert.equal(batchCampaignSchema.parse(input).scheduledAt, "2026-10-01T14:00:00.000Z");
  for (const scheduledAt of ["", "2026-02-30T09:00"]) {
    const result = batchCampaignSchema.safeParse({ ...input, scheduledAt });
    assert.equal(result.success, false);
    assert.equal(result.error.issues[0].path[0], "scheduledAt");
  }
  assert.equal(batchCampaignSchema.parse({ ...input, scheduleMode: "instant", scheduledAt: "invalid" }).scheduledAt, undefined);
});
