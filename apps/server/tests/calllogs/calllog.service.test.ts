import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listLiveCalls,
  signCallRecordingUrl,
} from "../../src/modules/calllogs/calllog.service.js";

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

test("listLiveCalls merges Redis registry and LiveKit room entries by call id", async () => {
  const startedAt = new Date().toISOString();
  const calls = await listLiveCalls(
    "org_123",
    {
      listRooms: async () => [
        {
          name: "call_123",
          numParticipants: 2,
          creationTime: Math.floor(Date.now() / 1000),
        },
      ],
      deleteRoom: async () => undefined,
    },
    {
      listActiveCalls: async () => [
        {
          version: 1,
          type: "call.started",
          organizationId: "org_123",
          callId: "call_123",
          roomName: "legacy_room_name",
          eventId: "0-0",
          occurredAt: startedAt,
          status: "active",
          agentId: "",
          direction: "inbound",
          fromNumber: "+15550000001",
          toNumber: "+15550000002",
          startedAt,
        },
      ],
      findActiveCallByRoom: async () => null,
      markCallStale: async () => undefined,
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.callId, "call_123");
  assert.equal(calls[0]?.participantCount, 2);
  assert.equal(calls[0]?.fromNumber, "+15550000001");
});

test("repeated foreign-room polls never enumerate LiveKit participants", async (t) => {
  const { default: prisma } = await import("../../src/config/prisma.js");
  const original = prisma.callBillingSession.count;
  prisma.callBillingSession.count = (async ({ where }: any) => {
    assert.deepEqual(where, { organizationId: "org_123", roomName: "foreign_room" });
    return 0;
  }) as any;
  t.after(() => { prisma.callBillingSession.count = original; });
  let lookups = 0;
  const roomClient = {
    listRooms: async () => [{ name: "foreign_room", numParticipants: 2 }],
    listParticipants: async () => { lookups++; return []; },
    deleteRoom: async () => {},
  };
  for (let poll = 0; poll < 2; poll++) assert.deepEqual(await listLiveCalls("org_123", roomClient), []);
  assert.equal(lookups, 0);
});
