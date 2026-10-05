import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createQuickOutboundCall,
  dispatchScheduledOutboundCall,
  outboundCallLimits,
  retryOutboundCall,
} from "../../src/modules/outbound/outbound-call.service.js";

test("createQuickOutboundCall uses the owned number carrier for persistence, billing, and dispatch", async () => {
  const calls: unknown[] = [];
  const repo = {
    getDialableNumber: async () => ({
      number: "+15551230000",
      sid: "carrier-sid-123",
      provider: "TWILIO",
    }),
    createQuickCall: async (input: any) => {
      calls.push(["create", input]);
      return { outboundId: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113", ...input };
    },
    markInProgress: async (outboundId: string, livekitParticipant: unknown) => {
      calls.push(["progress", outboundId, livekitParticipant]);
      return { outboundId, status: "IN_PROGRESS", livekitParticipant };
    },
    markFailed: async (outboundId: string, reason: string) => {
      calls.push(["failed", outboundId, reason]);
      return { outboundId, status: "FAILED" };
    },
  };
  const sipClient = {
    createSipParticipant: async (...args: unknown[]) => {
      calls.push(["sip", ...args]);
      return { participantId: "sip-participant-123" };
    },
  };
  const dispatchClient = {
    createDispatch: async (...args: unknown[]) => {
      calls.push(["dispatch", ...args]);
      return { dispatchId: "agent-dispatch-123" };
    },
  };

  const result = await createQuickOutboundCall(
    {
      organizationId: "org_123",
      userId: "user_123",
      agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
      phoneNumber: "+15550001111",
      fromNumber: "+15551230000",
      firstMessage: "Hello from outbound.",
      systemPrompt: "Outbound prompt.",
      username: "Ada",
      dynamicVariables: {
        first_name: "Ada",
        plan: "Starter",
      },
      provider: "TELNYX",
      sid: "client-forged-sid",
    } as any,
    {
      repository: repo,
      sipClient,
      dispatchClient,
      outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
      agentName: "QuickVoice",
    }
  );

  assert.equal(result.outbound.outboundId, "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(result.livekitParticipant.participantId, "sip-participant-123");
  assert.equal(result.agentDispatch.dispatchId, "agent-dispatch-123");

  const create = calls[0] as any[];
  assert.equal(create[0], "create");
  assert.equal(create[1].status, "SCHEDULED");
  assert.equal(create[1].mode, "quick");
  assert.equal("provider" in create[1], false);
  assert.equal("sid" in create[1], false);
  assert.deepEqual(create[1].optionalData, {
    username: "Ada",
    provider: "TWILIO",
    sid: "carrier-sid-123",
    dynamicVariables: {
      first_name: "Ada",
      plan: "Starter",
    },
  });

  const dispatch = calls[1] as any[];
  assert.equal(dispatch[0], "dispatch");
  assert.equal(dispatch[1], "outbound_2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(dispatch[2], "QuickVoice");

  assert.equal(dispatch[1], "outbound_2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  const dispatchMetadata = JSON.parse(dispatch[3].metadata);
  assert.equal(dispatchMetadata.call_id, "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(dispatchMetadata.outbound_id, "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(dispatchMetadata.direction, "outbound");
  assert.deepEqual(dispatchMetadata.dynamic_variables, {
    first_name: "Ada",
    plan: "Starter",
  });

  const sip = calls[2] as any[];
  assert.equal(sip[0], "sip");
  assert.equal(sip[1], "twilio-trunk");
  assert.equal(sip[2], "+15550001111");
  assert.equal(sip[3], "outbound_2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(sip[4].fromNumber, "+15551230000");
  assert.equal(sip[4].participantIdentity, "outbound-2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(sip[4].waitUntilAnswered, false);
  assert.equal(sip[4].maxCallDuration, 900);
  assert.equal(sip[4].ringingTimeout, 45);

  const metadata = JSON.parse(sip[4].participantMetadata);
  assert.deepEqual(metadata, {
    agent_id: "8d55565f-1111-4111-8111-f95fd03f0df2",
    organization_id: "org_123",
    user_id: "user_123",
    call_id: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
    outbound_id: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
    direction: "outbound",
    from_number: "+15551230000",
    to_number: "+15550001111",
    provider: "TWILIO",
    first_message: "Hello from outbound.",
    system_prompt: "Outbound prompt.",
    username: "Ada",
    dynamic_variables: {
      first_name: "Ada",
      plan: "Starter",
    },
  });

  assert.deepEqual(calls[3], ["progress", "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113", { username: "Ada", provider: "TWILIO", sid: "carrier-sid-123", dynamicVariables: { first_name: "Ada", plan: "Starter" }, livekitParticipant: { participantId: "sip-participant-123" }, agentDispatch: { dispatchId: "agent-dispatch-123" } }]);
});

test("createQuickOutboundCall marks the outbound row failed when LiveKit dispatch fails", async () => {
  const calls: unknown[] = [];
  const repo = {
    getDialableNumber: async () => ({
      number: "+15551230000",
      sid: "carrier-sid-123",
      provider: "TELNYX",
    }),
    createQuickCall: async (input: any) => ({ outboundId: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113", ...input }),
    markInProgress: async () => { throw new Error("should not mark progress"); },
    markFailed: async (outboundId: string, reason: string) => {
      calls.push([outboundId, reason]);
      return { outboundId, status: "FAILED" };
    },
  };
  const sipClient = {
    createSipParticipant: async () => {
      throw new Error("LiveKit unavailable");
    },
  };
  const dispatchClient = {
    createDispatch: async () => ({ dispatchId: "agent-dispatch-123" }),
  };

  await assert.rejects(
    createQuickOutboundCall(
      {
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
      },
      {
        repository: repo,
        sipClient,
        dispatchClient,
        outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
        agentName: "QuickVoice",
      }
    ),
    /LiveKit unavailable/
  );

  assert.equal(calls.length, 1);
  assert.equal((calls[0] as any[])[0], "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.match((calls[0] as any[])[1], /LiveKit unavailable/);
});

test("createQuickOutboundCall stops before billing and dialing when the agent limit is reached", async () => {
  const calls: string[] = [];
  const repo = {
    getDialableNumber: async () => ({
      number: "+15551230000",
      sid: "carrier-sid-123",
      provider: "TWILIO",
    }),
    createQuickCall: async (input: any) => ({ outboundId: "outbound_limited", ...input }),
    claimQuickOutboundCall: async () => ({
      claimed: false as const,
      reason: "Agent concurrent call limit reached",
    }),
    markInProgress: async () => {
      throw new Error("should not mark progress");
    },
    markFailed: async () => {
      calls.push("failed");
      return {} as never;
    },
  };

  await assert.rejects(
    createQuickOutboundCall(
      {
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
      },
      {
        repository: repo,
        sipClient: {
          createSipParticipant: async () => {
            calls.push("sip");
            return {};
          },
        },
        dispatchClient: {
          createDispatch: async () => {
            calls.push("dispatch");
            return {};
          },
        },
        outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
      },
    ),
    /concurrent call limit reached/,
  );
  assert.deepEqual(calls, ["failed"]);
});

test("createQuickOutboundCall deletes the LiveKit dispatch when SIP participant creation fails", async () => {
  const calls: unknown[] = [];
  const repo = {
    getDialableNumber: async () => ({
      number: "+15551230000",
      sid: "carrier-sid-123",
      provider: "TWILIO",
    }),
    createQuickCall: async (input: any) => ({ outboundId: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113", ...input }),
    markInProgress: async () => { throw new Error("should not mark progress"); },
    markFailed: async (outboundId: string, reason: string) => {
      calls.push(["failed", outboundId, reason]);
      return { outboundId, status: "FAILED" };
    },
  };
  const sipClient = {
    createSipParticipant: async () => {
      throw new Error("SIP participant failed");
    },
  };
  const dispatchClient = {
    createDispatch: async (...args: unknown[]) => {
      calls.push(["dispatch", ...args]);
      return { id: "dispatch-123" };
    },
    deleteDispatch: async (...args: unknown[]) => {
      calls.push(["deleteDispatch", ...args]);
    },
  };

  await assert.rejects(
    createQuickOutboundCall(
      {
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
      },
      {
        repository: repo,
        sipClient,
        dispatchClient,
        outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
        agentName: "QuickVoice",
      }
    ),
    /SIP participant failed/
  );

  assert.deepEqual(calls[1], [
    "deleteDispatch",
    "dispatch-123",
    "outbound_2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
  ]);
  assert.equal((calls[2] as any[])[0], "failed");
});

test("createQuickOutboundCall rejects calls from numbers not linked to the agent", async () => {
  const calls: unknown[] = [];
  const repo = {
    getDialableNumber: async () => null,
    createQuickCall: async (input: any) => {
      calls.push(["create", input]);
      return { outboundId: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113", ...input };
    },
    markInProgress: async () => {
      throw new Error("should not mark progress");
    },
    markFailed: async () => {
      throw new Error("should not mark failed");
    },
  };

  await assert.rejects(
    createQuickOutboundCall(
      {
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
      },
      {
        repository: repo,
        sipClient: { createSipParticipant: async () => ({}) },
        dispatchClient: { createDispatch: async () => ({}) },
        outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
        agentName: "QuickVoice",
      }
    ),
    /From number must belong to this organization and be linked to the selected agent/
  );

  assert.equal(calls.length, 0);
});

test("createQuickOutboundCall rejects when the organization has exhausted plan minutes", async () => {
  const calls: unknown[] = [];
  const repo = {
    getMonthlyUsage: async () => ({
      plan: "free",
      includedMinutes: 15,
      usedSeconds: 15 * 60,
    }),
    getDialableNumber: async () => {
      calls.push("dialable");
      return {
        number: "+15551230000",
        sid: "carrier-sid-123",
        provider: "TWILIO",
      };
    },
    createQuickCall: async () => {
      throw new Error("should not create outbound call");
    },
    markInProgress: async () => {
      throw new Error("should not mark progress");
    },
    markFailed: async () => {
      throw new Error("should not mark failed");
    },
  };

  await assert.rejects(
    createQuickOutboundCall(
      {
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
      },
      {
        repository: repo,
        hasActiveLegacySubscription: async () => true,
        sipClient: { createSipParticipant: async () => ({}) },
        dispatchClient: { createDispatch: async () => ({}) },
        outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
        agentName: "QuickVoice",
      }
    ),
    /Plan minutes exhausted/
  );

  assert.deepEqual(calls, []);
});

test("dispatchScheduledOutboundCall dispatches an existing campaign row with batch overrides", async () => {
  const calls: unknown[] = [];
  const repo = {
    getMonthlyUsage: async () => ({
      plan: "starter",
      includedMinutes: 100,
      usedSeconds: 0,
    }),
    getOutboundCallForDispatch: async (outboundId: string) => {
      calls.push(["load", outboundId]);
      return {
        outboundId,
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        campaignId: "campaign_123",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
        firstMessage: "Hi {{city}} customer.",
        systemPrompt: "Ask about {{other_dyn_variable}}.",
        optionalData: {
          rowNumber: 2,
          language: "hi-IN",
          voiceId: "aura-2-athena-en",
          dynamicVariables: {
            city: "Mumbai",
            other_dyn_variable: "renewal",
          },
          ringingTimeoutSeconds: 45,
        },
      };
    },
    getDialableNumber: async () => ({
      number: "+15551230000",
      sid: "carrier-sid-123",
      provider: "TWILIO",
    }),
    createQuickCall: async () => {
      throw new Error("should not create a second outbound call");
    },
    markInProgress: async (outboundId: string, optionalData: unknown) => {
      calls.push(["progress", outboundId, optionalData]);
      return { outboundId, status: "IN_PROGRESS", optionalData };
    },
    markFailed: async (outboundId: string, reason: string) => {
      calls.push(["failed", outboundId, reason]);
      return { outboundId, status: "FAILED" };
    },
  };
  const sipClient = {
    createSipParticipant: async (...args: unknown[]) => {
      calls.push(["sip", ...args]);
      return { participantId: "sip-participant-123" };
    },
  };
  const dispatchClient = {
    createDispatch: async (...args: unknown[]) => {
      calls.push(["dispatch", ...args]);
      return { dispatchId: "agent-dispatch-123" };
    },
  };

  const result = await dispatchScheduledOutboundCall(
    "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
    {
      repository: repo,
      sipClient,
      dispatchClient,
      roomClient: {
        deleteRoom: async () => undefined,
        listRooms: async () => [],
      },
      outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
      agentName: "QuickVoice",
    }
  );

  assert.equal(result.outbound.outboundId, "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");

  const dispatch = calls.find((call) => (call as unknown[])[0] === "dispatch") as any[];
  const dispatchMetadata = JSON.parse(dispatch[3].metadata);
  assert.equal(dispatchMetadata.call_id, "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(dispatchMetadata.campaign_id, "campaign_123");
  assert.equal(dispatchMetadata.language, "hi-IN");
  assert.equal(dispatchMetadata.voice_id, "aura-2-athena-en");
  assert.deepEqual(dispatchMetadata.dynamic_variables, {
    city: "Mumbai",
    other_dyn_variable: "renewal",
  });

  const sip = calls.find((call) => (call as unknown[])[0] === "sip") as any[];
  assert.equal(sip[3], "outbound_2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(sip[4].participantIdentity, "outbound-2b1f6d53-42f5-4cc7-9689-7b6f51a0c113");
  assert.equal(sip[4].ringingTimeout, 45);
  const participantMetadata = JSON.parse(sip[4].participantMetadata);
  assert.equal(participantMetadata.language, "hi-IN");
  assert.equal(participantMetadata.voice_id, "aura-2-athena-en");

  assert.equal(calls.some((call) => (call as unknown[])[0] === "failed"), false);
});

test("dispatchScheduledOutboundCall skips a campaign call cancelled before it is claimed", async () => {
  const calls: string[] = [];
  const result = await dispatchScheduledOutboundCall("outbound_cancelled", {
    repository: {
      getOutboundCallForDispatch: async () => null,
      getDialableNumber: async () => {
        calls.push("dialable");
        return null;
      },
      createQuickCall: async () => {
        throw new Error("should not create a call");
      },
      markInProgress: async () => {
        throw new Error("should not mark progress");
      },
      markFailed: async () => {
        calls.push("failed");
        return {} as never;
      },
    },
  });

  assert.equal(result, undefined);
  assert.deepEqual(calls, []);
});

test("dispatchScheduledOutboundCall recovers a prior SIP participant without dialing twice", async () => {
  const calls: unknown[] = [];
  const outboundId = "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113";
  const result = await dispatchScheduledOutboundCall(outboundId, {
    repository: {
      getOutboundCallForDispatch: async () => ({
        outboundId,
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        campaignId: "campaign_123",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
        firstMessage: "Hi.",
        systemPrompt: "Prompt.",
        optionalData: {},
      }),
      getDialableNumber: async () => ({
        number: "+15551230000",
        sid: "carrier-sid-123",
        provider: "TWILIO",
      }),
      createQuickCall: async () => {
        throw new Error("should not create a call");
      },
      markInProgress: async (_id: string, optionalData: unknown) => ({
        outboundId,
        status: "IN_PROGRESS",
        optionalData,
      }),
      markFailed: async () => {
        throw new Error("should not fail the recovered call");
      },
    },
    hasActiveLegacySubscription: async () => false,
    roomClient: {
      deleteRoom: async () => {
        throw new Error("should not delete the recovered room");
      },
      listRooms: async () => [{ name: `outbound_${outboundId}` }],
      listParticipants: async () => [
        { identity: `outbound-${outboundId}` },
      ],
    },
    sipClient: {
      createSipParticipant: async () => {
        calls.push("sip");
        return {};
      },
    },
    dispatchClient: {
      createDispatch: async () => {
        calls.push("dispatch");
        return {};
      },
    },
    outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
  });

  assert.equal(result?.recovered, true);
  assert.equal(result?.outbound.status, "IN_PROGRESS");
  assert.deepEqual(calls, []);
});

test("dispatchScheduledOutboundCall closes the room when cancellation wins during dialing", async () => {
  const calls: unknown[] = [];
  let cancelled = false;
  const outboundId = "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113";
  const repo = {
    getOutboundCallForDispatch: async () => cancelled ? null : ({
      outboundId,
      organizationId: "org_123",
      userId: "user_123",
      agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
      campaignId: "campaign_123",
      phoneNumber: "+15550001111",
      fromNumber: "+15551230000",
      firstMessage: "Hi.",
      systemPrompt: "Prompt.",
      optionalData: {},
    }),
    getDialableNumber: async () => ({
      number: "+15551230000",
      sid: "carrier-sid-123",
      provider: "TWILIO",
    }),
    createQuickCall: async () => {
      throw new Error("should not create a second outbound call");
    },
    markInProgress: async () => { cancelled = true; return null; },
    markFailed: async (_outboundId: string, reason: string) => {
      calls.push(["failed", reason]);
      return { outboundId, status: "FAILED" };
    },
  };

  const result = await dispatchScheduledOutboundCall(outboundId, {
      repository: repo,
      hasActiveLegacySubscription: async () => false,
      sipClient: { createSipParticipant: async () => ({ participantId: "sip-1" }) },
      dispatchClient: {
        createDispatch: async () => ({ id: "dispatch-1" }),
        deleteDispatch: async (...args: unknown[]) => {
          calls.push(["deleteDispatch", ...args]);
        },
      },
      roomClient: {
        deleteRoom: async (roomName: string) => {
          calls.push(["deleteRoom", roomName]);
        },
      },
      outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
      agentName: "QuickVoice",
    });
  assert.equal(result, undefined);

  assert.deepEqual(calls, [
    ["deleteRoom", `outbound_${outboundId}`],
    ["deleteDispatch", "dispatch-1", `outbound_${outboundId}`],
  ]);
});

test("dispatchScheduledOutboundCall marks an existing campaign row failed when quota is exhausted", async () => {
  const calls: unknown[] = [];
  const repo = {
    getMonthlyUsage: async () => ({
      plan: "free",
      includedMinutes: 15,
      usedSeconds: 15 * 60,
    }),
    getOutboundCallForDispatch: async (outboundId: string) => {
      calls.push(["load", outboundId]);
      return {
        outboundId,
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        campaignId: "campaign_123",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
        firstMessage: "Hi.",
        systemPrompt: "Prompt.",
        optionalData: {
          rowNumber: 2,
          sourceFileName: "recipients.csv",
        },
      };
    },
    getDialableNumber: async () => {
      calls.push(["dialable"]);
      return {
        number: "+15551230000",
        sid: "carrier-sid-123",
        provider: "TWILIO",
      };
    },
    createQuickCall: async () => {
      throw new Error("should not create a second outbound call");
    },
    markInProgress: async () => {
      throw new Error("should not mark progress");
    },
    markFailed: async (outboundId: string, reason: string) => {
      calls.push(["failed", outboundId, reason]);
      return { outboundId, status: "FAILED" };
    },
  };

  await assert.rejects(
    dispatchScheduledOutboundCall("2b1f6d53-42f5-4cc7-9689-7b6f51a0c113", {
      repository: repo,
      hasActiveLegacySubscription: async () => true,
      sipClient: { createSipParticipant: async () => ({}) },
      dispatchClient: { createDispatch: async () => ({}) },
      outboundTrunks: { TWILIO: "twilio-trunk", TELNYX: "telnyx-trunk" },
      agentName: "QuickVoice",
    }),
    /Plan minutes exhausted/
  );

  assert.deepEqual(calls, [
    ["load", "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113"],
    ["load", "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113"],
    [
      "failed",
      "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
      "Plan minutes exhausted for the current billing period",
    ],
  ]);
});

test("outbound calls always carry a LiveKit max duration and ringing timeout", () => {
  const previousMax = process.env.OUTBOUND_MAX_CALL_DURATION_SECONDS;
  const previousRinging = process.env.OUTBOUND_RINGING_TIMEOUT_SECONDS;
  try {
    delete process.env.OUTBOUND_MAX_CALL_DURATION_SECONDS;
    delete process.env.OUTBOUND_RINGING_TIMEOUT_SECONDS;
    assert.deepEqual(outboundCallLimits(), { maxCallDuration: 900, ringingTimeout: 45 });
    assert.deepEqual(outboundCallLimits(20), { maxCallDuration: 900, ringingTimeout: 20 });
    assert.deepEqual(outboundCallLimits(null), { maxCallDuration: 900, ringingTimeout: 45 });

    process.env.OUTBOUND_MAX_CALL_DURATION_SECONDS = "300";
    process.env.OUTBOUND_RINGING_TIMEOUT_SECONDS = "30";
    assert.deepEqual(outboundCallLimits(), { maxCallDuration: 300, ringingTimeout: 30 });

    process.env.OUTBOUND_MAX_CALL_DURATION_SECONDS = "not-a-number";
    assert.equal(outboundCallLimits().maxCallDuration, 900);
  } finally {
    if (previousMax === undefined) delete process.env.OUTBOUND_MAX_CALL_DURATION_SECONDS;
    else process.env.OUTBOUND_MAX_CALL_DURATION_SECONDS = previousMax;
    if (previousRinging === undefined) delete process.env.OUTBOUND_RINGING_TIMEOUT_SECONDS;
    else process.env.OUTBOUND_RINGING_TIMEOUT_SECONDS = previousRinging;
  }
});

for (const { name, stored, expected } of [
  {
    name: "current variables",
    stored: { dynamicVariables: { first_name: "Ada", plan: "Starter" } },
    expected: { first_name: "Ada", plan: "Starter" },
  },
  {
    name: "legacy variables",
    stored: { dynamic_variables: { first_name: "Ada" } },
    expected: { first_name: "Ada" },
  },
  {
    name: "current variables take precedence",
    stored: {
      dynamicVariables: { first_name: "Ada" },
      dynamic_variables: { first_name: "Old name" },
    },
    expected: { first_name: "Ada" },
  },
  { name: "no variables", stored: {}, expected: {} },
  {
    name: "malformed variables",
    stored: { dynamicVariables: { " first_name ": " Ada ", empty: " ", invalid: 42 } },
    expected: { first_name: "Ada" },
  },
]) {
  test(`retryOutboundCall preserves ${name} without reusing carrier internals`, async () => {
    let retryInput: Record<string, unknown> | undefined;
    const outbound = {
      outboundId: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
      organizationId: "org_123",
      userId: "user_123",
      agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
      phoneNumber: "+15550001111",
      fromNumber: "+15551230000",
      firstMessage: null,
      systemPrompt: null,
      status: "FAILED",
      optionalData: {
        ...stored,
        username: "Ada",
        provider: "TELNYX",
        sid: "stale-or-forged-sid",
      },
    };

    await retryOutboundCall(
      {
        organizationId: "org_123",
        userId: "user_456",
        outboundId: outbound.outboundId,
      },
      {
        repository: {
          getForOrg: async () => outbound,
        } as any,
        dispatchQuickCall: async (input: any) => {
          retryInput = input;
          return { accepted: true } as any;
        },
      },
    );

    assert.deepEqual(retryInput?.dynamicVariables, expected);
    assert.equal(retryInput?.organizationId, "org_123");
    assert.equal(retryInput?.userId, "user_456");
    assert.equal(retryInput?.username, "Ada");
    assert.equal("provider" in (retryInput ?? {}), false);
    assert.equal("sid" in (retryInput ?? {}), false);
  });
}
