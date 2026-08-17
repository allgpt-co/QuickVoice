import { PhoneNumberBillingStatus } from "../../../prisma/generated/prisma/client.js";
import { BadRequestError } from "../../common/errors/badRequest.js";

export function assertPhoneNumberCanLink(
  billingStatus: PhoneNumberBillingStatus,
  nextAgentId: string | null,
) {
  // An unlink reduces runtime access and must remain possible while suspended
  // or awaiting release. Only a new link requires an active rental.
  if (
    nextAgentId !== null &&
    billingStatus !== PhoneNumberBillingStatus.ACTIVE
  ) {
    throw new BadRequestError(
      "Reactivate billing for this phone number before linking it to an agent",
    );
  }
}
