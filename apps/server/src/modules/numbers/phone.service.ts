import { TelephonyProvider } from "../../../prisma/generated/prisma/client.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { telnyxClient } from "../../config/telnyx.js";
import { twilioClient } from "../../config/twilio.js";
import * as phoneRepository from "./phone.repository.js";
import * as agentRepository from "../agent/agent.repository.js";
import type {
  BuyNumberArgs,
  SearchNumbersInput,
  UpdateNumberArgs,
} from "./phone.schema.js";
import formatPhoneNumber from "../../common/utils/formatPhoneNumber.js";
import setProviderBinding from "../../common/utils/setProviderBinding.js";
import setLiveKitBinding from "../../common/utils/setLiveKitBinding.js";
import { parseUsdToMicros } from "../billing/money.js";
import { createNumberQuote } from "./number-quote.service.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import { numberPurchaseService } from "./number-purchase.service.js";
import { assertPhoneNumberCanLink } from "./phone-billing-guards.js";
import {
  createNumberDeleter,
  type NumberDeletionDeps,
} from "./number-deletion.service.js";

export {
  createNumberDeleter,
  PhoneNumberReleaseClaimLostError,
  type DeleteNumberOptions,
  type NumberDeletionDeps,
} from "./number-deletion.service.js";

// Normalized shape returned by searchAvailableNumbers, so callers never have
// to branch on provider-specific field names.

export type AvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  isoCountry?: string;
  providerMonthlyCostMicros: string;
  monthlyPriceMicros: string;
  quoteId: string;
  quoteExpiresAt: string;
  rateCatalogVersion: string;
};

export const searchAvailableNumbers = async (
  input: SearchNumbersInput,
  organizationId: string,
): Promise<AvailableNumber[]> => {
  const { provider, country, areaCode, limit } = input;

  if (provider === TelephonyProvider.TWILIO) {
    const results = await twilioClient
      .availablePhoneNumbers(country)
      .local.list({
        areaCode,
        voiceEnabled: true,
        limit: limit ?? 10,
      });

    const pricing = await twilioClient.pricing.v1.phoneNumbers
      .countries(country)
      .fetch();
    const localPrice = pricing.phoneNumberPrices?.find(
      (price) => price.numberType?.toLowerCase() === "local",
    );
    if (
      !localPrice?.currentPrice ||
      pricing.priceUnit?.toUpperCase() !== "USD"
    ) {
      throw new BadRequestError(
        "Current USD rental pricing is unavailable for this country",
      );
    }
    const providerMonthlyCostMicros = parseUsdToMicros(localPrice.currentPrice);

    return results.map((r) => {
      const quote = createNumberQuote({
        organizationId,
        phoneNumber: r.phoneNumber,
        provider,
        providerMonthlyCostMicros,
        billingCountryIso: country,
        billingNumberType: "local",
      });
      return {
        phoneNumber: r.phoneNumber,
        friendlyName: r.friendlyName,
        locality: r.locality,
        region: r.region,
        isoCountry: r.isoCountry,
        providerMonthlyCostMicros: providerMonthlyCostMicros.toString(),
        monthlyPriceMicros: quote.monthlyPriceMicros.toString(),
        quoteId: quote.quoteId,
        quoteExpiresAt: quote.expiresAt,
        rateCatalogVersion: quote.rateCatalogVersion,
      };
    });
  } else {
    // Telnyx
    const response = await telnyxClient.availablePhoneNumbers.list({
      filter: {
        country_code: country,
        phone_number_type: "local",
        features: ["voice"],
        limit: limit ?? 10,
      },
    });
    if (!response.data) {
      throw new NotFoundError("No numbers found");
    }

    return response.data.map((d) => {
      const rawMonthlyCost = d.cost_information?.monthly_cost;
      if (typeof rawMonthlyCost !== "string") {
        throw new BadRequestError(
          "Current USD rental pricing is unavailable for this number",
        );
      }
      if (
        d.cost_information?.currency &&
        d.cost_information.currency.toUpperCase() !== "USD"
      ) {
        throw new BadRequestError(
          "Only USD-denominated phone number rentals are currently supported",
        );
      }
      const providerMonthlyCostMicros = parseUsdToMicros(rawMonthlyCost);
      const quote = createNumberQuote({
        organizationId,
        phoneNumber: d.phone_number as string,
        provider,
        providerMonthlyCostMicros,
        billingCountryIso: country,
        billingNumberType: "local",
      });
      return {
        phoneNumber: d.phone_number as string,
        friendlyName: formatPhoneNumber(d.phone_number as string),
        locality: d.region_information?.find(
          (r) => r.region_type === "location",
        )?.region_name,
        region: d.region_information?.find((r) => r.region_type === "state")
          ?.region_name,
        isoCountry: country,
        providerMonthlyCostMicros: providerMonthlyCostMicros.toString(),
        monthlyPriceMicros: quote.monthlyPriceMicros.toString(),
        quoteId: quote.quoteId,
        quoteExpiresAt: quote.expiresAt,
        rateCatalogVersion: quote.rateCatalogVersion,
      };
    });
  }
};

export const listOrgNumbers = async (organizationId: string) => {
  return phoneRepository.listByOrg(organizationId);
};

// export const getNumber = async (organizationId: string, phId: string) => {
//   const row = await phoneRepository.getByIdForOrg(phId, organizationId);
//   if (!row) {
//     throw new NotFoundError("Phone number not found");
//   }
//   return row;
// };

export const buyNumber = async (args: BuyNumberArgs) => {
  const { organizationId, userId, provider, phoneNumber } = args;

  if (isHostedBilling) {
    return numberPurchaseService.purchaseNumber(args);
  }

  const existing = await phoneRepository.getByNumberForOrg(
    phoneNumber,
    organizationId,
  );
  if (existing) return existing;

  // Step 1: buy at provider WITHOUT attaching to the SIP trunk/connection.
  // Trunk/connection attachment happens later, during agent linking. Store the
  // provider-side stable identifier as `sid`.
  let sid: string;
  let resolvedFriendlyName: string;

  if (provider === TelephonyProvider.TWILIO) {
    const purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
    });
    sid = purchased.sid;
    resolvedFriendlyName = purchased.friendlyName ?? phoneNumber;
  } else {
    const order = await telnyxClient.numberOrders.create({
      phone_numbers: [{ phone_number: phoneNumber }],
    });
    const orderedNumber = order.data?.phone_numbers?.[0];
    if (!orderedNumber?.id) {
      throw new BadRequestError(
        "Telnyx did not return a phone number ID for the order",
      );
    }
    sid = orderedNumber.id;
    resolvedFriendlyName = formatPhoneNumber(phoneNumber);
  }

  // Step 2: insert DB row. The number is not yet attached to the LiveKit
  // inbound trunk — that happens later when the number is linked to an agent.
  // If the DB insert fails, release at the provider so we don't leave a paid
  // orphan.
  try {
    const row = await phoneRepository.createPhoneNumber({
      organizationId,
      userId,
      number: phoneNumber,
      sid,
      friendlyName: resolvedFriendlyName,
      provider,
    });
    return row;
  } catch (err) {
    // Best-effort rollback. Log loudly — a failure here leaves a paid number
    // floating at the provider with no QuickVoice record.
    try {
      if (provider === TelephonyProvider.TWILIO) {
        await twilioClient.incomingPhoneNumbers(sid).remove();
      } else {
        await telnyxClient.phoneNumbers.delete(sid);
      }
    } catch (rollbackErr) {
      console.error(
        "[numbers] CRITICAL: rollback failed after buyNumber error — paid orphan at provider",
        { provider, sid, phoneNumber, originalError: err, rollbackErr },
      );
    }
    throw err;
  }
};

// Guard that the target agent lives in the caller's org (or is null, meaning
// unlink). Throws NotFoundError if a non-null agentId doesn't match anything.
const assertAgentInOrg = async (
  agentId: string | null,
  organizationId: string,
) => {
  if (agentId === null) return;
  const exists = await agentRepository.agentExistsInOrg(
    agentId,
    organizationId,
  );
  if (!exists) {
    throw new NotFoundError("Agent not found");
  }
};

// Maps the (prior linked state, new linked state) pair to the side-effect op
// we need to run on the provider + LiveKit. Re-linking between two agents is
// purely a DB change — the number is already attached at both layers.
const decideTrunkOp = (
  priorAgentId: string | null,
  nextAgentId: string | null,
): "attach" | "detach" | null => {
  const wasLinked = priorAgentId !== null;
  const willBeLinked = nextAgentId !== null;
  if (!wasLinked && willBeLinked) return "attach";
  if (wasLinked && !willBeLinked) return "detach";
  return null;
};

// A reversible side-effect. `revert` should undo `apply` when the next step
// fails. Each entry is pushed onto a stack as it succeeds so the catch block
// can unwind in reverse order.
type RevertStep = {
  name: string;
  revert: () => Promise<void>;
};

export const linkAgentToNumber = async (args: UpdateNumberArgs) => {
  const { organizationId, phId, agentId } = args;

  await assertAgentInOrg(agentId, organizationId);

  // Need the row up front for two reasons: the E.164 `number` we send to the
  // provider/LiveKit, and the prior `agentId` so we can decide whether the
  // trunk needs touching at all.
  const existing = await phoneRepository.getByIdForOrg(phId, organizationId);
  if (!existing) {
    throw new NotFoundError("Phone number not found");
  }
  assertPhoneNumberCanLink(existing.billingStatus, agentId);

  const trunkOp = decideTrunkOp(existing.agentId, agentId);

  // Order: provider → LiveKit → DB. Each successful side-effect pushes its
  // revert onto the stack; the catch block unwinds the stack in reverse so we
  // don't leave provider/LiveKit drifting from the DB.
  const revertStack: RevertStep[] = [];

  try {
    if (trunkOp !== null) {
      const attach = trunkOp === "attach";

      await setProviderBinding(attach, existing);
      revertStack.push({
        name: "provider",
        revert: () => setProviderBinding(!attach, existing),
      });

      await setLiveKitBinding(attach, existing);
      revertStack.push({
        name: "livekit",
        revert: () => setLiveKitBinding(!attach, existing),
      });
    }

    const updated = await phoneRepository.linkAgent(
      phId,
      organizationId,
      agentId,
      existing.agentId,
    );
    if (!updated) {
      throw new NotFoundError("Phone number not found");
    }
    return updated;
  } catch (err) {
    // Best-effort, reverse-order rollback. Log loudly on revert failure —
    // a leaked partial state needs human cleanup.
    while (revertStack.length > 0) {
      const step = revertStack.pop()!;
      try {
        await step.revert();
      } catch (revertErr) {
        console.error(
          `[numbers] CRITICAL: ${step.name} revert failed after linkAgentToNumber error — ${step.name}/DB drift`,
          {
            phId,
            number: existing.number,
            provider: existing.provider,
            sid: existing.sid,
            trunkOp,
            step: step.name,
            originalError: err,
            revertErr,
          },
        );
      }
    }
    throw err;
  }
};

const numberDeletionDeps: NumberDeletionDeps = {
  getByIdForOrg: phoneRepository.getByIdForOrg,
  refreshClaimedNumberForRelease:
    phoneRepository.refreshClaimedNumberForRelease,
  setProviderBinding,
  setLiveKitBinding,
  removeTwilioNumber: (sid) => twilioClient.incomingPhoneNumbers(sid).remove(),
  deleteTelnyxNumber: (sid) => telnyxClient.phoneNumbers.delete(sid),
  deletePhoneNumber: phoneRepository.deletePhoneNumber,
  deleteClaimedPhoneNumber: phoneRepository.deleteClaimedPhoneNumber,
};

export const deleteNumber = createNumberDeleter(numberDeletionDeps);
