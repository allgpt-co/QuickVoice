export type RenewalReservationState = "ACTIVE" | "SETTLED";

export type RenewalSettlementFenceDeps = {
  reservationState: RenewalReservationState;
  refreshClaim: () => Promise<boolean>;
  settleActiveReservation: () => Promise<void>;
  releaseActiveReservation: () => Promise<void>;
  onReleaseFailure?: (error: unknown) => void;
};

/**
 * Performs the last CAS check before wallet settlement. A worker whose lease
 * was replaced can release its still-active reserve, but it must never debit
 * the wallet after losing the phone-number operation claim.
 */
export async function settleRenewalUnderClaim(
  deps: RenewalSettlementFenceDeps,
): Promise<"ready" | "claim_lost"> {
  if (!(await deps.refreshClaim())) {
    if (deps.reservationState === "ACTIVE") {
      try {
        await deps.releaseActiveReservation();
      } catch (error) {
        // Reservation expiry is a second recovery path. Losing the phone claim
        // must still prevent settlement even if immediate release races or
        // temporarily fails.
        deps.onReleaseFailure?.(error);
      }
    }
    return "claim_lost";
  }

  if (deps.reservationState === "ACTIVE") {
    await deps.settleActiveReservation();
  }
  return "ready";
}
