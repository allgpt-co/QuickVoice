import assert from "node:assert/strict";
import test from "node:test";

import { CallBillingSessionStatus } from "../../prisma/generated/prisma/enums.js";
import {
  FIRST_REPORT_GRACE_MS,
  REPORTING_GAP_GRACE_MS,
  hangUpSilentCall,
  providerCallIdFromParticipants,
  silentSessionWhere,
} from "../../src/modules/billing/silent-call-watchdog.service.js";

test("selects only active telephony calls that never reported or stopped reporting", () => {
  const now = new Date("2026-09-28T10:00:00.000Z");
  const where = silentSessionWhere(now);

  assert.equal(where.status, CallBillingSessionStatus.ACTIVE);
  assert.deepEqual(where.telephonyProvider, { not: null });
  assert.deepEqual(where.OR, [
    {
      lastUsageSequence: 0,
      createdAt: { lte: new Date(now.getTime() - FIRST_REPORT_GRACE_MS) },
    },
    {
      lastUsageSequence: { gt: 0 },
      updatedAt: { lte: new Date(now.getTime() - REPORTING_GAP_GRACE_MS) },
    },
  ]);
});

test("reads the Twilio call SID from the SIP participant", () => {
  assert.equal(
    providerCallIdFromParticipants([
      { attributes: { "lk.agent.state": "listening" } },
      { attributes: { "sip.twilio.callSid": " CA123 ", "sip.callID": "SCL_1" } },
    ]),
    "CA123",
  );
  assert.equal(
    providerCallIdFromParticipants([
      { attributes: { telnyxCallControlId: "v3:abc" } },
    ]),
    "v3:abc",
  );
  assert.equal(providerCallIdFromParticipants([{}, { attributes: {} }]), null);
});

test("hang-up deletes the room and captures the provider call id", async () => {
  const deleted: string[] = [];
  const result = await hangUpSilentCall("outbound_1", {
    listParticipants: async () => [
      { attributes: { "sip.twilio.callSid": "CA999" } },
    ],
    deleteRoom: async (roomName) => {
      deleted.push(roomName);
    },
  });

  assert.deepEqual(result, { hungUp: true, providerCallId: "CA999" });
  assert.deepEqual(deleted, ["outbound_1"]);
});

test("a room that is already gone counts as hung up", async () => {
  const notFound = Object.assign(new Error("room not found"), {
    status: 404,
    code: "not_found",
  });
  const result = await hangUpSilentCall("outbound_2", {
    listParticipants: async () => {
      throw notFound;
    },
    deleteRoom: async () => {
      throw notFound;
    },
  });

  assert.deepEqual(result, { hungUp: true, providerCallId: null });
});

test("a failed hang-up is reported so billing is not ended on a live call", async () => {
  const result = await hangUpSilentCall("outbound_3", {
    listParticipants: async () => [],
    deleteRoom: async () => {
      throw Object.assign(new Error("livekit unavailable"), { status: 503 });
    },
  });

  assert.equal(result.hungUp, false);
});
