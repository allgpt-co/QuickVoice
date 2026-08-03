import type { InngestFunction } from "inngest";

import { dataRetention } from "./data-retention.js";
import {
  billPhoneNumbers,
  expireBillingReservations,
  recoverPhoneNumberPurchases,
  reconcileProviderCallCosts,
  reconcileStripeWallet,
  transitionLegacyBilling,
} from "./billing-maintenance.js";

// All inngest functions — passed to the serve handler in index.ts.
export const inngestFunctions: InngestFunction.Any[] = [
  dataRetention,
  expireBillingReservations,
  recoverPhoneNumberPurchases,
  reconcileProviderCallCosts,
  reconcileStripeWallet,
  billPhoneNumbers,
  transitionLegacyBilling,
];
