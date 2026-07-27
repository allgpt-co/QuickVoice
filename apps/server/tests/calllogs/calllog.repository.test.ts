import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CallStatus,
  TelephonyProvider,
} from "../../prisma/generated/prisma/client.js";
import {
  buildCallLogIdentityFields,
  saveCallLogInTransaction,
} from "../../src/modules/calllogs/calllog.repository.js";
import {
  callLogSchema,
  type IngestCallLogArgs,
} from "../../src/modules/calllogs/calllog.schema.js";

const baseInput: IngestCallLogArgs = {
  organizationId: "org_123",
  userId: "user_123",
  agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
  callId: "call_123",
  startTime: "2026-07-03T12:00:00Z",
  endTime: "2026-07-03T12:01:00Z",
  direction: "outbound",
  durationSeconds: 60,
  status: CallStatus.COMPLETED,
  metadata: {
    summary: "Caller asked to call +15550001111 again.",
    intent: "Follow up with +15551230000",
    outboundId: null,
  },
  recordingSid: "",
  transcripts: [],
  toNumber: "+15550001111",
  fromNumber: "+15551230000",
  provider: TelephonyProvider.TWILIO,
  extractedData: [],
  evaluatedData: [],
};

test("call log identity fields keep structured phone numbers raw while redacting free-form metadata", () => {
  const { callerId, metadata } = buildCallLogIdentityFields(baseInput, true);

  assert.equal(callerId, "+15550001111");
  assert.equal(metadata.fromNumber, "+15551230000");
  assert.equal(metadata.toNumber, "+15550001111");
  assert.equal(
    metadata.summary,
    "Caller asked to call [REDACTED_PHONE] again.",
  );
  assert.equal(metadata.intent, "Follow up with [REDACTED_PHONE]");
});

test("call log schema preserves extra metadata keys from completed calls", () => {
  const parsed = callLogSchema.parse({
    ...baseInput,
    metadata: {
      ...baseInput.metadata,
      campaignId: "campaign_123",
      leadSource: "website",
    },
  });

  assert.equal(parsed.metadata?.campaignId, "campaign_123");
  assert.equal(parsed.metadata?.leadSource, "website");
});

test("call log identity fields preserve extra metadata while redacting free-form values", () => {
  const { metadata } = buildCallLogIdentityFields(
    {
      ...baseInput,
      metadata: {
        ...baseInput.metadata,
        leadSource: "website",
        callerNote: "Email avery@example.com or call +15559990000",
      } as IngestCallLogArgs["metadata"],
    },
    true,
  );

  assert.equal(metadata.leadSource, "website");
  assert.equal(
    metadata.callerNote,
    "Email [REDACTED_EMAIL] or call [REDACTED_PHONE]",
  );
  assert.equal(metadata.fromNumber, "+15551230000");
  assert.equal(metadata.toNumber, "+15550001111");
});

test("inbound call callerId uses the external caller number", () => {
  const { callerId } = buildCallLogIdentityFields(
    {
      ...baseInput,
      direction: "inbound",
    },
    true,
  );

  assert.equal(callerId, "+15551230000");
});

test("web widget call identity does not invent a caller id", () => {
  const parsed = callLogSchema.parse({
    ...baseInput,
    direction: "inbound",
    fromNumber: "",
    toNumber: "",
    provider: "WEB_WIDGET",
    metadata: {
      summary: "",
      intent: "",
      outboundId: null,
      source: "web_widget",
      widgetId: "wgt_123",
    },
  });
  const { callerId, metadata } = buildCallLogIdentityFields(parsed, true);

  assert.equal(callerId, null);
  assert.equal(metadata.fromNumber, "");
  assert.equal(metadata.toNumber, "");
  assert.equal(metadata.provider, "WEB_WIDGET");
  assert.equal(metadata.source, "web_widget");
});

test("duplicate call ingestion returns the existing same-org row without duplicating children", async () => {
  const existing = {
    callId: baseInput.callId,
    organizationId: baseInput.organizationId,
  };
  let transcriptWrites = 0;
  let outboundWrites = 0;
  const tx = {
    callLog: {
      createMany: async () => ({ count: 0 }),
      findUnique: async () => existing,
    },
    callTranscript: {
      createMany: async () => {
        transcriptWrites += 1;
        return { count: 1 };
      },
    },
    outboundCall: {
      updateMany: async () => {
        outboundWrites += 1;
        return { count: 1 };
      },
    },
  };

  const result = await saveCallLogInTransaction(
    tx as never,
    {
      ...baseInput,
      metadata: { ...baseInput.metadata, outboundId: "outbound_123" },
      transcripts: [
        {
          role: "assistant",
          message: "Hello",
          timestamp: "2026-07-03T12:00:01Z",
        },
      ],
    },
    true,
  );

  assert.equal(result, existing);
  assert.equal(transcriptWrites, 0);
  assert.equal(outboundWrites, 0);
});

test("duplicate call identifiers cannot cross organization boundaries", async () => {
  const tx = {
    callLog: {
      createMany: async () => ({ count: 0 }),
      findUnique: async () => ({
        callId: baseInput.callId,
        organizationId: "org_other",
      }),
    },
  };

  await assert.rejects(
    saveCallLogInTransaction(tx as never, baseInput, true),
    /Call identifier is already in use/,
  );
});
