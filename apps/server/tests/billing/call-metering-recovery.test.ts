import assert from "node:assert/strict";
import test from "node:test";

import type { BillingTransaction } from "../../prisma/generated/prisma/client.js";
import { ReservationStateError } from "../../src/modules/billing/wallet-ledger.service.js";
import {
  calculateRollingReserveMicros,
  reserveRollingCreditWithRecovery,
  selectPendingUsageCheckpoint,
} from "../../src/modules/billing/call-metering.service.js";

function checkpoint(callId: string, sequence: number) {
  return {
    usageCheckpoint: {
      version: 1,
      callId,
      sequence,
      final: false,
      connectedSeconds: sequence * 10,
      connectedMilliseconds: String(sequence * 10_000),
      aiCostMicros: String(sequence * 100),
      platformCostMicros: String(sequence * 10),
      telephonyEstimatedMicros: String(sequence * 20),
      targetTotalSettledMicros: String(sequence * 130),
      priorDebtIncurredMicros: "0",
      nextReserveMicros: "1000",
      modelUsage: [],
      sessionId: "session-1",
      roomName: "outbound_call-1",
      agentId: null,
      userId: null,
      telephonyProvider: "TWILIO",
      providerCallId: "CA123",
      endedAt: null,
    },
  };
}

function transaction(metadata: unknown, debtDeltaMicros = 0n) {
  return {
    metadata,
    debtDeltaMicros,
  } as unknown as BillingTransaction;
}

test("recovery selects the highest settled checkpoint ahead of a lagging session pointer", () => {
  const recovered = selectPendingUsageCheckpoint(
    [
      transaction(checkpoint("call-1", 2)),
      transaction(checkpoint("call-1", 4), 25n),
      transaction(checkpoint("other-call", 9)),
      transaction(checkpoint("call-1", 1)),
    ],
    "call-1",
    1,
  );

  assert.equal(recovered?.checkpoint.sequence, 4);
  assert.equal(recovered?.transaction.debtDeltaMicros, 25n);
  assert.equal(
    selectPendingUsageCheckpoint(
      [transaction(checkpoint("call-1", 4))],
      "call-1",
      4,
    ),
    undefined,
  );
});

test("released orphan reserve advances to a deterministic recovery generation", async () => {
  const keys: string[] = [];
  const fakeReserve = async (args: { idempotencyKey: string }) => {
    keys.push(args.idempotencyKey);
    if (keys.length === 1) {
      throw new ReservationStateError("released-hold", "RELEASED");
    }
    return { reservation: { billingReservationId: "replacement-hold" } };
  };

  const result = await reserveRollingCreditWithRecovery(
    {
      organizationId: "org-1",
      callId: "call-1",
      sequence: 7,
      amountMicros: 50_000n,
      now: new Date("2026-08-01T00:00:00.000Z"),
    },
    fakeReserve as never,
  );

  assert.equal(result.reservation.billingReservationId, "replacement-hold");
  assert.deepEqual(keys, [
    "call:call-1:reserve:7",
    "call:call-1:reserve:7:recovery:g1",
  ]);
});

test("rolling reserve extrapolates by elapsed time without multiplying a lumpy telephony minute", () => {
  assert.equal(
    calculateRollingReserveMicros({
      configuredReserveMicros: 500n,
      priorConnectedMilliseconds: 10_000n,
      connectedMilliseconds: 25_000n,
      priorAiAndPlatformMicros: 100n,
      aiAndPlatformMicros: 400n,
    }),
    1_200n,
  );

  assert.equal(
    calculateRollingReserveMicros({
      configuredReserveMicros: 2_000n,
      priorConnectedMilliseconds: 59_000n,
      connectedMilliseconds: 60_000n,
      priorAiAndPlatformMicros: 1_000n,
      aiAndPlatformMicros: 1_010n,
    }),
    2_000n,
  );
});
