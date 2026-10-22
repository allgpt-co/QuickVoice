import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getCallRecordingDownloadUrl,
  endLiveCall,
  listLiveCalls,
  signCallRecordingUrl,
} from "../../src/modules/calllogs/calllog.service.js";

test("recording download signs the organization-owned S3 key as an attachment", async (t) => {
  const { default: prisma } = await import("../../src/config/prisma.js");
  const original = prisma.callLog.findFirst;
  prisma.callLog.findFirst = (async ({ where }: any) => {
    assert.deepEqual(where, { callId: "call-1", organizationId: "org-1", deleted: false });
    return { audioRecordingPath: "Voice-agents/Recordings/call-1.ogg" };
  }) as typeof original;
  t.after(() => { prisma.callLog.findFirst = original; });

  const url = await getCallRecordingDownloadUrl("org-1", "call-1", async (key, expiry, fileName) => {
    assert.equal(key, "Voice-agents/Recordings/call-1.ogg");
    assert.equal(expiry, 3600);
    assert.equal(fileName, "recording-call-1.ogg");
    return "https://example.test/signed-attachment";
  });
  assert.equal(url, "https://example.test/signed-attachment");
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

test("empty outbound rooms are not live even during the startup grace period", async (t) => {
  const { default: prisma } = await import("../../src/config/prisma.js");
  const original = prisma.outboundCall.count;
  prisma.outboundCall.count = (async () => 1) as typeof original;
  t.after(() => { prisma.outboundCall.count = original; });
  const now = Math.floor(Date.now() / 1000);
  const calls = await listLiveCalls("org_123", {
    listRooms: async () => [
      { name: "outbound_rejected", numParticipants: 0, creationTime: now - 900 },
      { name: "outbound_starting", numParticipants: 0, creationTime: now },
      { name: "outbound_connected", numParticipants: 2, creationTime: now - 900 },
      { name: "outbound_unknown_time", numParticipants: 0 },
    ],
    deleteRoom: async () => undefined,
  });
  assert.deepEqual(calls.map((call) => call.callId), ["connected"]);
});

test("empty rooms clear even a fresh active Redis registration", async () => {
  const startedAt = new Date().toISOString();
  const stale: string[] = [];
  const calls = await listLiveCalls("org_123", {
    listRooms: async () => [{ name: "outbound_rejected", numParticipants: 0, creationTime: Date.now() / 1000 }],
    deleteRoom: async () => undefined,
  }, {
    listActiveCalls: async () => [{
      version: 1, type: "call.started", organizationId: "org_123", callId: "rejected",
      roomName: "outbound_rejected", eventId: "0-0", occurredAt: startedAt,
      status: "active", agentId: "", direction: "outbound",
      fromNumber: "+13022079009", toNumber: "+919876543210", startedAt,
    }],
    findActiveCallByRoom: async () => null,
    markCallStale: async (_organizationId, callId) => { stale.push(callId); },
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(stale, ["rejected"]);
});

test("manually ending a call clears its active registry entry after room deletion", async () => {
  const operations: string[] = [];
  const result = await endLiveCall("org_123", "outbound_rejected", {
    listRooms: async () => [],
    deleteRoom: async (name) => { operations.push(`delete:${name}`); },
  }, {
    listActiveCalls: async () => [],
    findActiveCallByRoom: async () => ({
      version: 1, type: "call.started", organizationId: "org_123", callId: "rejected",
      roomName: "outbound_rejected", eventId: "0-0", occurredAt: new Date().toISOString(),
      status: "active", agentId: "", direction: "outbound", fromNumber: "", toNumber: "",
      startedAt: new Date().toISOString(),
    }),
    markCallStale: async (_org, callId) => { operations.push(`stale:${callId}`); },
  });
  assert.equal(result.status, "ended");
  assert.deepEqual(operations, ["delete:outbound_rejected", "stale:rejected"]);
});
