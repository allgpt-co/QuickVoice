import assert from "node:assert/strict";
import { test } from "node:test";

import { callLogSchema } from "../../src/modules/calllogs/calllog.schema.js";
import { signCallRecordingUrl } from "../../src/modules/calllogs/calllog.service.js";


test("callLogSchema accepts agent flow metadata", () => {
  const parsed = callLogSchema.parse({
    organizationId: "org_123",
    userId: "user_123",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    callId: "room-123",
    startTime: "2026-05-27T12:00:00Z",
    endTime: "2026-05-27T12:01:00Z",
    direction: "inbound",
    durationSeconds: 60,
    status: "COMPLETED",
    metadata: {
      flow: {
        flowId: "44444444-4444-4444-8444-444444444444",
        path: [
          {
            node_id: "start",
            agent_id: "8d55565f-1111-4111-8111-f95fd03f0df2",
            reason: null,
          },
          {
            node_id: "returns",
            agent_id: "22222222-2222-4222-8222-222222222222",
            reason: "Customer needs returns",
          },
        ],
      },
    },
    recordingSid: "",
    transcripts: [],
    toNumber: "+15551230000",
    fromNumber: "+15550001111",
    provider: "TWILIO",
    extractedData: [],
    evaluatedData: [],
  });

  assert.equal(parsed.metadata?.flow?.path?.[1]?.node_id, "returns");
});

test("signCallRecordingUrl replaces a stored S3 key with a signed playback URL", async () => {
  const call = {
    callId: "SCL_recording123",
    audioRecordingPath: "Voice-agents/Recordings/recording-123.ogg",
  };

  const signed = await signCallRecordingUrl(call, async (key) => {
    return `https://recordings.quickvoice.test/${encodeURIComponent(key)}?signature=test`;
  });

  assert.equal(
    signed.audioRecordingPath,
    "https://recordings.quickvoice.test/Voice-agents%2FRecordings%2Frecording-123.ogg?signature=test"
  );
  assert.equal(call.audioRecordingPath, "Voice-agents/Recordings/recording-123.ogg");
});

test("signCallRecordingUrl leaves missing recordings and existing URLs unchanged", async () => {
  const nullRecording = await signCallRecordingUrl(
    { callId: "SCL_no_recording", audioRecordingPath: null },
    async () => {
      throw new Error("should not sign empty recording path");
    }
  );
  assert.equal(nullRecording.audioRecordingPath, null);

  const existingUrl = await signCallRecordingUrl(
    {
      callId: "SCL_url_recording",
      audioRecordingPath: "https://cdn.quickvoice.test/recording.ogg",
    },
    async () => {
      throw new Error("should not sign existing URL");
    }
  );
  assert.equal(
    existingUrl.audioRecordingPath,
    "https://cdn.quickvoice.test/recording.ogg"
  );
});
