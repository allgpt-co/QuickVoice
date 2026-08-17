import assert from "node:assert/strict";
import test from "node:test";

import { settleRenewalUnderClaim } from "../../src/modules/numbers/number-renewal-fence.js";

test("a stale renewal worker releases its reserve and never settles", async () => {
  let settled = 0;
  let released = 0;

  const result = await settleRenewalUnderClaim({
    reservationState: "ACTIVE",
    refreshClaim: async () => false,
    settleActiveReservation: async () => {
      settled += 1;
    },
    releaseActiveReservation: async () => {
      released += 1;
    },
  });

  assert.equal(result, "claim_lost");
  assert.equal(settled, 0);
  assert.equal(released, 1);
});

test("a current renewal claim settles exactly once", async () => {
  let settled = 0;
  let released = 0;

  const result = await settleRenewalUnderClaim({
    reservationState: "ACTIVE",
    refreshClaim: async () => true,
    settleActiveReservation: async () => {
      settled += 1;
    },
    releaseActiveReservation: async () => {
      released += 1;
    },
  });

  assert.equal(result, "ready");
  assert.equal(settled, 1);
  assert.equal(released, 0);
});

test("an already-settled reservation still requires a fresh claim", async () => {
  let settled = 0;
  let released = 0;

  const result = await settleRenewalUnderClaim({
    reservationState: "SETTLED",
    refreshClaim: async () => false,
    settleActiveReservation: async () => {
      settled += 1;
    },
    releaseActiveReservation: async () => {
      released += 1;
    },
  });

  assert.equal(result, "claim_lost");
  assert.equal(settled, 0);
  assert.equal(released, 0);
});
