import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBatchCampaignSchema,
  quickOutboundCallSchema,
} from "../../src/modules/outbound/outbound-call.schema.js";

const batchCampaign = {
  name: "Morning follow-up",
  agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
  fromNumber: "+15551230000",
  sourceFileKey: "outbound-batches/org_123/recipients.csv",
  sourceFileName: "recipients.csv",
};

test("quickOutboundCallSchema strips client-supplied carrier internals", () => {
  const parsed = quickOutboundCallSchema.parse({
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    phoneNumber: "+15550001111",
    fromNumber: "+15551230000",
    provider: "twilio",
    sid: "carrier-sid-123",
  });

  assert.equal("provider" in parsed, false);
  assert.equal("sid" in parsed, false);
});

test("quickOutboundCallSchema accepts quick-call payload without provider internals", () => {
  const parsed = quickOutboundCallSchema.parse({
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    phoneNumber: "+15550001111",
    fromNumber: "+15551230000",
    firstMessage: "This is a short test call.",
  });

  assert.equal(parsed.agentId, "8d55565f-1111-4111-8111-f95fd03f0df2");
  assert.equal(parsed.phoneNumber, "+15550001111");
  assert.equal(parsed.fromNumber, "+15551230000");
  assert.equal("provider" in parsed, false);
  assert.equal("sid" in parsed, false);
});

test("campaign schedules accept absolute timestamps or local times in a valid IANA timezone", () => {
  const utc = createBatchCampaignSchema.parse({
    ...batchCampaign,
    scheduledAt: "2026-10-01T14:00:00Z",
    timezone: "UTC",
  });
  const offset = createBatchCampaignSchema.parse({
    ...batchCampaign,
    scheduledAt: "2026-10-01T09:00:00-05:00",
    timezone: "America/Chicago",
  });

  assert.equal(utc.scheduledAt?.toISOString(), "2026-10-01T14:00:00.000Z");
  assert.equal(offset.scheduledAt?.toISOString(), "2026-10-01T14:00:00.000Z");
  assert.equal(
    createBatchCampaignSchema.safeParse({
      ...batchCampaign,
      scheduledAt: "2026-10-01T09:00:00",
      timezone: "America/Chicago",
    }).success,
    true,
  );
  assert.equal(
    createBatchCampaignSchema.safeParse({
      ...batchCampaign,
      scheduledAt: "2026-10-01T14:00:00Z",
      timezone: "Not/A_Timezone",
    }).success,
    false,
  );
});

test("campaign API rejects rolled dates", () => {
  for (const scheduledAt of [
    "2026-02-30T09:00:00Z", "2026-02-29T09:00:00Z", "2026-04-31T09:00:00Z",
    "2026-10-01T24:00:00Z",
  ]) {
    assert.equal(createBatchCampaignSchema.safeParse({
      ...batchCampaign, scheduledAt, timezone: "America/New_York",
    }).success, false, scheduledAt);
  }
});

test("an API caller can explicitly distinguish both occurrences of a DST overlap", () => {
  for (const [scheduledAt, expected] of [
    ["2026-11-01T01:30:00-04:00", "2026-11-01T05:30:00.000Z"],
    ["2026-11-01T01:30:00-05:00", "2026-11-01T06:30:00.000Z"],
  ]) {
    assert.equal(createBatchCampaignSchema.parse({
      ...batchCampaign, scheduledAt, timezone: "America/New_York",
    }).scheduledAt?.toISOString(), expected);
  }
});

for (const [scheduledAt, timezone, expected] of [
  ["2026-10-01 09:00", "Asia/Kolkata", "2026-10-01T03:30:00.000Z"],
  ["2026-03-08T02:30", "America/New_York", "2026-03-08T07:30:00.000Z"],
  ["2026-11-01T01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
]) test(`campaign wall-clock conversion: ${scheduledAt}`, () => {
  assert.equal(createBatchCampaignSchema.parse({ ...batchCampaign, scheduledAt, timezone }).scheduledAt?.toISOString(), expected);
});
