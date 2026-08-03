import { randomUUID } from "node:crypto";

import {
  BillingReservationPurpose,
  BillingReservationStatus,
  PhoneNumberPurchaseStatus,
  type BillingReservation,
  type PhoneNumber,
  type PhoneNumberPurchase,
} from "../../../prisma/generated/prisma/client.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import CustomApiError from "../../common/errors/customApiError.js";
import { PaymentRequiredError } from "../../common/errors/paymentRequired.js";
import {
  InsufficientCreditError,
  releaseReservation,
  reservePaidNumberCredit,
  settleReservation,
} from "../billing/wallet-ledger.service.js";
import { triggerAutoRecharge } from "../billing/stripe-wallet.service.js";
import type { BuyNumberArgs } from "./phone.schema.js";
import {
  verifyNumberQuote,
  verifyNumberQuoteForRecovery,
  type NumberQuote,
} from "./number-quote.service.js";
import {
  numberPurchaseProviderGateway,
  type NumberPurchaseProviderGateway,
  type ProviderPurchaseResult,
} from "./number-purchase.provider.js";
import {
  NumberPurchasePersistenceConflictError,
  numberPurchaseStore,
  type NumberPurchaseStore,
} from "./number-purchase.repository.js";
import {
  isDefinitiveProviderError,
  providerErrorCode,
  safeErrorMessage,
} from "./provider-error.js";

const PURCHASE_LEASE_MS = 5 * 60 * 1_000;
const AMBIGUOUS_PROVIDER_RETRY_DELAY_MS = 30 * 1_000;

type WalletReservation = Pick<
  BillingReservation,
  | "billingReservationId"
  | "organizationId"
  | "purpose"
  | "status"
  | "idempotencyKey"
  | "amountMicros"
  | "referenceType"
  | "referenceId"
>;

export interface NumberPurchaseWallet {
  reserve(
    args: Parameters<typeof reservePaidNumberCredit>[0],
  ): Promise<{ reservation: WalletReservation }>;
  settle(args: Parameters<typeof settleReservation>[0]): Promise<unknown>;
  release(args: Parameters<typeof releaseReservation>[0]): Promise<unknown>;
  triggerAutoRecharge(
    organizationId: string,
    options: { requiredPaidMicros: bigint; contextKey: string },
  ): Promise<unknown>;
}

const defaultWallet: NumberPurchaseWallet = {
  reserve: reservePaidNumberCredit,
  settle: settleReservation,
  release: releaseReservation,
  triggerAutoRecharge: (organizationId, options) =>
    triggerAutoRecharge(organizationId, "threshold", options),
};

export type NumberPurchaseServiceDeps = {
  store?: NumberPurchaseStore;
  wallet?: NumberPurchaseWallet;
  providerGateway?: NumberPurchaseProviderGateway;
  now?: () => Date;
  randomId?: () => string;
};

export type NumberPurchaseResumeResult =
  | { claimed: false }
  | { claimed: true; phone: PhoneNumber };

class NumberPurchaseConflictError extends CustomApiError {
  constructor(message: string, code: string) {
    super(message, 409, { code });
  }
}

type VerifiedRecoveryQuote = NumberQuote & { nonce: string };

export class NumberPurchaseService {
  private readonly store: NumberPurchaseStore;
  private readonly wallet: NumberPurchaseWallet;
  private readonly providerGateway: NumberPurchaseProviderGateway;
  private readonly now: () => Date;
  private readonly randomId: () => string;

  constructor(deps: NumberPurchaseServiceDeps = {}) {
    this.store = deps.store ?? numberPurchaseStore;
    this.wallet = deps.wallet ?? defaultWallet;
    this.providerGateway =
      deps.providerGateway ?? numberPurchaseProviderGateway;
    this.now = deps.now ?? (() => new Date());
    this.randomId = deps.randomId ?? randomUUID;
  }

  async purchaseNumber(args: BuyNumberArgs): Promise<PhoneNumber> {
    if (!args.quoteId) {
      throw new BadRequestError(
        "A current number price quote is required. Search again before purchasing.",
      );
    }

    const now = this.now();
    const recoveryQuote = verifyNumberQuoteForRecovery({
      quoteId: args.quoteId,
      organizationId: args.organizationId,
      phoneNumber: args.phoneNumber,
      provider: args.provider,
      now,
    });

    let purchase = await this.store.findByNonce(
      recoveryQuote.nonce,
      args.organizationId,
    );
    if (purchase) {
      this.assertPurchaseMatchesQuote(purchase, recoveryQuote);
    } else {
      const existingNumber = await this.store.findPhoneByNumber(
        args.phoneNumber,
      );
      if (existingNumber) {
        if (existingNumber.organizationId === args.organizationId) {
          return existingNumber;
        }
        throw unavailableNumber();
      }

      // Recovery decoding deliberately accepts old signed values. A new saga
      // still requires the normal current/expiry validation immediately before
      // it is inserted.
      const currentQuote = verifyNumberQuote({
        quoteId: args.quoteId,
        organizationId: args.organizationId,
        phoneNumber: args.phoneNumber,
        provider: args.provider,
        now,
      });
      const created = await this.createPurchase(args, currentQuote, now);
      if ("phId" in created) return created;
      purchase = created;
    }

    const terminal = await this.terminalResult(purchase);
    if (terminal) return terminal;

    const processingToken = this.randomId();
    const claimed = await this.store.claim({
      purchaseId: purchase.phoneNumberPurchaseId,
      processingToken,
      now,
      processingExpiresAt: new Date(now.getTime() + PURCHASE_LEASE_MS),
    });
    if (!claimed) {
      const current = await this.store.findByNonce(
        recoveryQuote.nonce,
        args.organizationId,
      );
      if (current) {
        const completed = await this.terminalResult(current);
        if (completed) return completed;
      }
      throw processingConflict();
    }

    return this.resumeClaimedPurchase(claimed, processingToken);
  }

  /**
   * Resumes an already-persisted purchase without relying on the original
   * signed quote. This is intentionally ID-based and internal-only so a
   * maintenance worker can recover an abandoned saga. The store claim is the
   * concurrency boundary: an active request or another worker always wins
   * without issuing a second provider purchase.
   */
  async resumePurchase(
    phoneNumberPurchaseId: string,
  ): Promise<NumberPurchaseResumeResult> {
    const now = this.now();
    const processingToken = this.randomId();
    const claimed = await this.store.claim({
      purchaseId: phoneNumberPurchaseId,
      processingToken,
      now,
      processingExpiresAt: new Date(now.getTime() + PURCHASE_LEASE_MS),
    });
    if (!claimed) return { claimed: false };

    return {
      claimed: true,
      phone: await this.resumeClaimedPurchase(claimed, processingToken),
    };
  }

  private async createPurchase(
    args: BuyNumberArgs,
    quote: VerifiedRecoveryQuote,
    now: Date,
  ): Promise<PhoneNumberPurchase | PhoneNumber> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.store.create({
          phoneNumberPurchaseId: this.randomId(),
          quoteNonce: quote.nonce,
          organizationId: args.organizationId,
          requestedByUserId: args.userId,
          phoneNumber: args.phoneNumber,
          provider: args.provider,
          providerMonthlyCostMicros: quote.providerMonthlyCostMicros,
          rentalPriceMicros: quote.monthlyPriceMicros,
          billingCountryIso: quote.billingCountryIso,
          billingNumberType: quote.billingNumberType,
          rateCatalogVersion: quote.rateCatalogVersion,
          quoteExpiresAt: new Date(quote.expiresAt),
          persistedPhoneNumberId: this.randomId(),
        });
      } catch (error) {
        const byNonce = await this.store.findByNonce(
          quote.nonce,
          args.organizationId,
        );
        if (byNonce) {
          this.assertPurchaseMatchesQuote(byNonce, quote);
          return byNonce;
        }

        const active = await this.store.findActiveByNumber(args.phoneNumber);
        if (active) {
          const retired = await this.store.failExpiredUnfunded({
            purchaseId: active.phoneNumberPurchaseId,
            now,
          });
          if (retired && attempt === 0) continue;
          throw unavailableNumber();
        }

        const owner = await this.store.findPhoneByNumber(args.phoneNumber);
        if (owner) {
          if (owner.organizationId === args.organizationId) return owner;
          throw unavailableNumber();
        }
        throw error;
      }
    }
    throw unavailableNumber();
  }

  private async resumeClaimedPurchase(
    initial: PhoneNumberPurchase,
    processingToken: string,
  ): Promise<PhoneNumber> {
    let purchase = initial;

    if (purchase.status === PhoneNumberPurchaseStatus.PENDING) {
      const reservationOutcome = await this.ensureReservation(
        purchase,
        processingToken,
      );
      if ("phone" in reservationOutcome) return reservationOutcome.phone;
      purchase = reservationOutcome.purchase;
    }

    if (
      purchase.status === PhoneNumberPurchaseStatus.RESERVED ||
      purchase.status === PhoneNumberPurchaseStatus.PROVIDER_PENDING
    ) {
      purchase = await this.ensureProviderPurchase(purchase, processingToken);
    }

    let phone: PhoneNumber;
    if (purchase.status === PhoneNumberPurchaseStatus.PROVIDER_PURCHASED) {
      if (!purchase.providerResourceId) {
        await this.store.markRequiresAttention({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "PROVIDER_RESOURCE_ID_MISSING",
          errorMessage:
            "Provider acquisition completed without a stable phone number ID",
        });
        throw attentionConflict();
      }
      try {
        phone = await this.store.persistPhone({
          purchase,
          processingToken,
          input: {
            organizationId: purchase.organizationId,
            userId: purchase.requestedByUserId,
            phoneNumber: purchase.phoneNumber,
            provider: purchase.provider,
            providerResourceId: purchase.providerResourceId,
            friendlyName: purchase.providerFriendlyName ?? purchase.phoneNumber,
            providerMonthlyCostMicros: purchase.providerMonthlyCostMicros,
            rentalPriceMicros: purchase.rentalPriceMicros,
            billingCountryIso: purchase.billingCountryIso,
            billingNumberType: purchase.billingNumberType,
            rateCatalogVersion: purchase.rateCatalogVersion,
            purchasedAt: purchase.providerPurchasedAt ?? this.now(),
          },
        });
      } catch (error) {
        if (error instanceof NumberPurchasePersistenceConflictError) {
          await this.store.markRequiresAttention({
            purchaseId: purchase.phoneNumberPurchaseId,
            processingToken,
            errorCode: "PHONE_NUMBER_PERSISTENCE_CONFLICT",
            errorMessage: safeErrorMessage(error),
          });
          throw attentionConflict();
        }
        await this.store.recordRecoverableError({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "PHONE_NUMBER_PERSISTENCE_FAILED",
          errorMessage: safeErrorMessage(error),
        });
        throw error;
      }
      purchase = {
        ...purchase,
        status: PhoneNumberPurchaseStatus.NUMBER_PERSISTED,
      };
    } else {
      const persistedPhone = await this.store.findPhoneById(
        purchase.persistedPhoneNumberId,
        purchase.organizationId,
      );
      if (!persistedPhone) {
        await this.store.markRequiresAttention({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "PERSISTED_PHONE_NUMBER_MISSING",
          errorMessage:
            "Purchase state says the phone number was persisted, but its row is missing",
        });
        throw attentionConflict();
      }
      phone = persistedPhone;
    }

    if (purchase.status !== PhoneNumberPurchaseStatus.NUMBER_PERSISTED) {
      await this.store.recordRecoverableError({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        errorCode: "INVALID_PURCHASE_STATE",
        errorMessage: `Cannot settle purchase from ${purchase.status}`,
      });
      throw new Error(
        `Unexpected phone number purchase state: ${purchase.status}`,
      );
    }

    try {
      await this.wallet.settle({
        organizationId: purchase.organizationId,
        reservationId: requiredReservationId(purchase),
        actualAmountMicros: purchase.rentalPriceMicros,
        idempotencyKey: settlementKey(purchase.quoteNonce),
        description: "Phone number rental purchased",
        metadata: {
          phId: phone.phId,
          phoneNumber: purchase.phoneNumber,
          provider: purchase.provider,
        },
      });
    } catch (error) {
      const reservation = await this.store.findReservation(
        purchase.organizationId,
        reservationKey(purchase.quoteNonce),
      );
      if (
        reservation &&
        reservation.status !== BillingReservationStatus.ACTIVE &&
        reservation.status !== BillingReservationStatus.SETTLED
      ) {
        await this.store.markRequiresAttention({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "NUMBER_RESERVATION_RELEASED_BEFORE_SETTLEMENT",
          errorMessage: safeErrorMessage(error),
        });
        throw attentionConflict();
      }
      await this.store.recordRecoverableError({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        errorCode: "NUMBER_SETTLEMENT_FAILED",
        errorMessage: safeErrorMessage(error),
      });
      throw error;
    }

    await this.store.markSucceeded({
      purchaseId: purchase.phoneNumberPurchaseId,
      processingToken,
      completedAt: this.now(),
    });
    return phone;
  }

  private async ensureReservation(
    purchase: PhoneNumberPurchase,
    processingToken: string,
  ): Promise<{ purchase: PhoneNumberPurchase } | { phone: PhoneNumber }> {
    const key = reservationKey(purchase.quoteNonce);
    let reservation = await this.store.findReservation(
      purchase.organizationId,
      key,
    );

    if (!reservation) {
      if (purchase.quoteExpiresAt.getTime() <= this.now().getTime()) {
        await this.store.markFailed({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          failedAt: this.now(),
          errorCode: "QUOTE_EXPIRED_BEFORE_RESERVATION",
          errorMessage: "The quote expired before funds were reserved",
        });
        throw new BadRequestError(
          "Number price quote expired. Search again for current pricing.",
        );
      }

      try {
        const result = await this.wallet.reserve({
          organizationId: purchase.organizationId,
          amountMicros: purchase.rentalPriceMicros,
          idempotencyKey: key,
          purpose: BillingReservationPurpose.PHONE_NUMBER_PURCHASE,
          referenceType: "phone_number_quote",
          referenceId: purchase.quoteNonce,
          description: "Phone number rental purchase",
          // Number orders can remain pending upstream. A generic expired-hold
          // sweep must not refund this reserve while the provider may still
          // deliver the number; the saga releases it explicitly on failure.
          expiresAt: undefined,
          metadata: {
            phoneNumber: purchase.phoneNumber,
            provider: purchase.provider,
            rateCatalogVersion: purchase.rateCatalogVersion,
          },
        });
        reservation = result.reservation as BillingReservation;
      } catch (error) {
        await this.store.recordRecoverableError({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode:
            error instanceof InsufficientCreditError
              ? error.code
              : "NUMBER_RESERVATION_FAILED",
          errorMessage: safeErrorMessage(error),
        });
        if (error instanceof InsufficientCreditError) {
          void this.wallet
            .triggerAutoRecharge(purchase.organizationId, {
              requiredPaidMicros: purchase.rentalPriceMicros,
              contextKey: `number-purchase:${purchase.phoneNumberPurchaseId}`,
            })
            .catch(() => undefined);
          throw new PaymentRequiredError(
            "Paid wallet credit is required to rent a phone number",
            {
              requiredMicros: error.requiredMicros.toString(),
              availablePaidMicros: error.availableMicros.toString(),
              promotionalCreditAllowed: false,
            },
          );
        }
        throw error;
      }
    }

    if (!this.reservationMatchesPurchase(reservation, purchase)) {
      await this.store.markRequiresAttention({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        errorCode: "NUMBER_RESERVATION_MISMATCH",
        errorMessage:
          "Recovered wallet reservation does not match the purchase",
      });
      throw attentionConflict();
    }

    if (reservation.status === BillingReservationStatus.RELEASED) {
      await this.store.markFailed({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        failedAt: this.now(),
        errorCode: "NUMBER_RESERVATION_RELEASED",
        errorMessage: "The number purchase reservation was already released",
      });
      throw failedConflict();
    }

    if (reservation.status === BillingReservationStatus.SETTLED) {
      const phone = await this.store.findPhoneById(
        purchase.persistedPhoneNumberId,
        purchase.organizationId,
      );
      if (!phone) {
        await this.store.markRequiresAttention({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "SETTLED_NUMBER_MISSING",
          errorMessage:
            "The wallet was settled but the purchased phone number is missing",
        });
        throw attentionConflict();
      }
      await this.store.markSucceeded({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        completedAt: this.now(),
      });
      return { phone };
    }

    const updated = await this.store.recordReservation({
      purchaseId: purchase.phoneNumberPurchaseId,
      processingToken,
      billingReservationId: reservation.billingReservationId,
    });
    return { purchase: updated };
  }

  private async ensureProviderPurchase(
    purchase: PhoneNumberPurchase,
    processingToken: string,
  ): Promise<PhoneNumberPurchase> {
    const reservation = await this.store.findReservation(
      purchase.organizationId,
      reservationKey(purchase.quoteNonce),
    );
    if (
      !reservation ||
      !this.reservationMatchesPurchase(reservation, purchase)
    ) {
      await this.store.markRequiresAttention({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        errorCode: "NUMBER_RESERVATION_MISSING_OR_MISMATCHED",
        errorMessage:
          "The wallet reservation required for provider purchase is unavailable",
      });
      throw attentionConflict();
    }
    if (reservation.status === BillingReservationStatus.RELEASED) {
      // This is the recovery point for a crash after a definitive provider
      // failure released funds but before the saga could be marked FAILED.
      await this.store.markFailed({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        failedAt: this.now(),
        errorCode: "NUMBER_RESERVATION_RELEASED",
        errorMessage: "The number purchase reservation was already released",
      });
      throw failedConflict();
    }
    if (reservation.status === BillingReservationStatus.SETTLED) {
      await this.store.markRequiresAttention({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        errorCode: "NUMBER_SETTLED_BEFORE_PROVIDER_PURCHASE",
        errorMessage:
          "The wallet was settled before provider acquisition was recorded",
      });
      throw attentionConflict();
    }

    let recovered: ProviderPurchaseResult | null = null;
    if (
      purchase.providerAttemptedAt ||
      purchase.providerOrderId ||
      purchase.status === PhoneNumberPurchaseStatus.PROVIDER_PENDING
    ) {
      try {
        recovered = await this.providerGateway.recover(purchase);
      } catch (error) {
        await this.store.recordRecoverableError({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "PROVIDER_RECOVERY_LOOKUP_FAILED",
          errorMessage: safeErrorMessage(error),
        });
        throw error;
      }
      if (recovered) {
        return this.applyProviderResult(purchase, processingToken, recovered);
      }

      const attemptedAt = purchase.providerAttemptedAt?.getTime() ?? 0;
      if (
        this.now().getTime() - attemptedAt <
        AMBIGUOUS_PROVIDER_RETRY_DELAY_MS
      ) {
        await this.store.recordRecoverableError({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "PROVIDER_RESULT_PENDING",
          errorMessage:
            "The provider has not exposed the result of the prior purchase attempt yet",
        });
        throw processingConflict();
      }
    }

    purchase = await this.store.recordProviderAttempt({
      purchaseId: purchase.phoneNumberPurchaseId,
      processingToken,
      attemptedAt: this.now(),
    });

    let result: ProviderPurchaseResult;
    try {
      result = await this.providerGateway.purchase(purchase);
    } catch (error) {
      // A timeout can happen after the provider committed the purchase. Always
      // perform the discovery lookup before deciding whether a wallet reserve
      // may be released or another provider request may later be attempted.
      try {
        recovered = await this.providerGateway.recover(purchase);
      } catch {
        recovered = null;
      }
      if (recovered) {
        return this.applyProviderResult(purchase, processingToken, recovered);
      }
      if (isDefinitiveProviderError(error)) {
        return this.failProviderPurchase(
          purchase,
          processingToken,
          providerErrorCode(error),
          safeErrorMessage(error),
        );
      }

      await this.store.recordRecoverableError({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        errorCode: providerErrorCode(error),
        errorMessage: safeErrorMessage(error),
      });
      throw error;
    }
    // Keep saga transition errors outside the provider SDK catch. In
    // particular, a legitimate asynchronous Telnyx order records
    // PROVIDER_PENDING and intentionally returns a retryable 409.
    return this.applyProviderResult(purchase, processingToken, result);
  }

  private async applyProviderResult(
    purchase: PhoneNumberPurchase,
    processingToken: string,
    result: ProviderPurchaseResult,
  ): Promise<PhoneNumberPurchase> {
    if (result.state === "failed") {
      return this.failProviderPurchase(
        purchase,
        processingToken,
        result.errorCode,
        result.errorMessage,
      );
    }
    if (result.state === "pending") {
      await this.store.recordProviderPending({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        providerOrderId: result.orderId,
        providerResourceId: result.resourceId,
        friendlyName: result.friendlyName,
      });
      throw processingConflict();
    }
    return this.store.recordProviderPurchased({
      purchaseId: purchase.phoneNumberPurchaseId,
      processingToken,
      providerResourceId: result.resourceId,
      providerOrderId: result.orderId,
      friendlyName: result.friendlyName,
      purchasedAt: this.now(),
    });
  }

  private async failProviderPurchase(
    purchase: PhoneNumberPurchase,
    processingToken: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<never> {
    const reservation = await this.store.findReservation(
      purchase.organizationId,
      reservationKey(purchase.quoteNonce),
    );
    if (reservation?.status === BillingReservationStatus.SETTLED) {
      await this.store.markRequiresAttention({
        purchaseId: purchase.phoneNumberPurchaseId,
        processingToken,
        errorCode: "PROVIDER_FAILED_AFTER_SETTLEMENT",
        errorMessage,
      });
      throw attentionConflict();
    }
    if (reservation?.status === BillingReservationStatus.ACTIVE) {
      try {
        await this.wallet.release({
          organizationId: purchase.organizationId,
          reservationId: reservation.billingReservationId,
          idempotencyKey: releaseKey(purchase.quoteNonce),
          description: "Release phone number reserve after provider failure",
          metadata: { errorCode },
        });
      } catch (error) {
        await this.store.recordRecoverableError({
          purchaseId: purchase.phoneNumberPurchaseId,
          processingToken,
          errorCode: "NUMBER_RESERVATION_RELEASE_FAILED",
          errorMessage: safeErrorMessage(error),
        });
        throw error;
      }
    }
    await this.store.markFailed({
      purchaseId: purchase.phoneNumberPurchaseId,
      processingToken,
      failedAt: this.now(),
      errorCode,
      errorMessage,
    });
    throw failedConflict();
  }

  private async terminalResult(
    purchase: PhoneNumberPurchase,
  ): Promise<PhoneNumber | null> {
    if (purchase.status === PhoneNumberPurchaseStatus.SUCCEEDED) {
      const phone = await this.store.findPhoneById(
        purchase.persistedPhoneNumberId,
        purchase.organizationId,
      );
      if (!phone) {
        throw new NumberPurchaseConflictError(
          "This number quote was already used for a completed purchase and cannot be used again.",
          "NUMBER_QUOTE_ALREADY_CONSUMED",
        );
      }
      return phone;
    }
    if (purchase.status === PhoneNumberPurchaseStatus.FAILED) {
      const reservation = await this.store.findReservation(
        purchase.organizationId,
        reservationKey(purchase.quoteNonce),
      );
      if (reservation?.status === BillingReservationStatus.ACTIVE) {
        await this.wallet
          .release({
            organizationId: purchase.organizationId,
            reservationId: reservation.billingReservationId,
            idempotencyKey: releaseKey(purchase.quoteNonce),
            description: "Recover release for failed phone number purchase",
          })
          .catch(() => undefined);
      }
      throw failedConflict();
    }
    if (purchase.status === PhoneNumberPurchaseStatus.REQUIRES_ATTENTION) {
      throw attentionConflict();
    }
    return null;
  }

  private reservationMatchesPurchase(
    reservation: BillingReservation | WalletReservation,
    purchase: PhoneNumberPurchase,
  ): boolean {
    return (
      reservation.organizationId === purchase.organizationId &&
      reservation.idempotencyKey === reservationKey(purchase.quoteNonce) &&
      reservation.purpose === BillingReservationPurpose.PHONE_NUMBER_PURCHASE &&
      reservation.amountMicros === purchase.rentalPriceMicros &&
      reservation.referenceType === "phone_number_quote" &&
      reservation.referenceId === purchase.quoteNonce &&
      (purchase.billingReservationId === null ||
        purchase.billingReservationId === reservation.billingReservationId)
    );
  }

  private assertPurchaseMatchesQuote(
    purchase: PhoneNumberPurchase,
    quote: VerifiedRecoveryQuote,
  ) {
    if (
      purchase.phoneNumber !== quote.phoneNumber ||
      purchase.provider !== quote.provider ||
      purchase.providerMonthlyCostMicros !== quote.providerMonthlyCostMicros ||
      purchase.rentalPriceMicros !== quote.monthlyPriceMicros ||
      purchase.billingCountryIso !== quote.billingCountryIso ||
      purchase.billingNumberType !== quote.billingNumberType ||
      purchase.rateCatalogVersion !== quote.rateCatalogVersion ||
      purchase.quoteExpiresAt.getTime() !== new Date(quote.expiresAt).getTime()
    ) {
      throw new BadRequestError(
        "Invalid number price quote. Search again before purchasing.",
      );
    }
  }
}

function reservationKey(nonce: string) {
  return `number-purchase:${nonce}`;
}

function settlementKey(nonce: string) {
  return `number-purchase:${nonce}:settle`;
}

function releaseKey(nonce: string) {
  return `number-purchase:${nonce}:provider-failed`;
}

function requiredReservationId(purchase: PhoneNumberPurchase): string {
  if (!purchase.billingReservationId) {
    throw new Error("Phone number purchase is missing its wallet reservation");
  }
  return purchase.billingReservationId;
}

function processingConflict() {
  return new NumberPurchaseConflictError(
    "Phone number purchase is still processing. Retry this same quote shortly.",
    "NUMBER_PURCHASE_PROCESSING",
  );
}

function failedConflict() {
  return new NumberPurchaseConflictError(
    "This phone number purchase did not complete. Search again for a new number quote.",
    "NUMBER_PURCHASE_FAILED",
  );
}

function attentionConflict() {
  return new NumberPurchaseConflictError(
    "This phone number purchase needs support review before it can continue.",
    "NUMBER_PURCHASE_REQUIRES_ATTENTION",
  );
}

function unavailableNumber() {
  return new NumberPurchaseConflictError(
    "This phone number is no longer available.",
    "PHONE_NUMBER_UNAVAILABLE",
  );
}

export const numberPurchaseService = new NumberPurchaseService();
