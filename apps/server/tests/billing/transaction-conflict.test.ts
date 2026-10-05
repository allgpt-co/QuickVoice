import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRetryableTransactionConflict,
  retryDelayMs,
  withTransactionConflictRetries,
} from "../../src/modules/billing/transaction-conflict.js";

test("recognizes Prisma and nested pg transaction conflicts", () => {
  const conflicts = [
    { code: "P2034" },
    {
      name: "DriverAdapterError",
      cause: { kind: "postgres", code: "40001" },
    },
    {
      name: "DriverAdapterError",
      cause: { kind: "postgres", originalCode: "40P01" },
    },
    { cause: { kind: "TransactionWriteConflict" } },
    {
      meta: {
        driverAdapterError: {
          cause: { kind: "postgres", sqlState: "40001" },
        },
      },
    },
    { message: "Transaction failed with SQLSTATE: 40001" },
  ];

  for (const conflict of conflicts) {
    assert.equal(isRetryableTransactionConflict(conflict), true);
  }
});

test("does not retry unrelated or cyclic errors", () => {
  const cyclic: { code: string; cause?: unknown } = { code: "23505" };
  cyclic.cause = cyclic;

  assert.equal(isRetryableTransactionConflict(cyclic), false);
  assert.equal(
    isRetryableTransactionConflict({
      name: "DriverAdapterError",
      cause: { kind: "postgres", code: "23505" },
    }),
    false,
  );
  assert.equal(
    isRetryableTransactionConflict(new Error("connection lost")),
    false,
  );
});

test("retries ten-way billing contention with bounded jittered backoff", async () => {
  let attempts = 0;
  const delays: number[] = [];

  const result = await withTransactionConflictRetries(
    async () => {
      attempts += 1;
      if (attempts < 10) throw { code: "40001" };
      return "committed";
    },
    {
      random: () => 0,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.equal(result, "committed");
  assert.equal(attempts, 10);
  assert.deepEqual(delays, [5, 10, 20, 40, 80, 125, 125, 125, 125]);
});

test("never retries a conflict immediately and caps its backoff", () => {
  assert.equal(retryDelayMs(1, 10, 250, 0), 5);
  assert.equal(retryDelayMs(1, 10, 250, 1), 10);
  assert.equal(retryDelayMs(20, 10, 250, 1), 250);
});

test("does not retry non-transaction failures", async () => {
  let attempts = 0;
  let sleeps = 0;
  const failure = new Error("connection lost");

  await assert.rejects(
    withTransactionConflictRetries(
      async () => {
        attempts += 1;
        throw failure;
      },
      { sleep: async () => void (sleeps += 1) },
    ),
    (error) => error === failure,
  );

  assert.equal(attempts, 1);
  assert.equal(sleeps, 0);
});
