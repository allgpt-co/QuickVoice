import type { InngestFunction } from "inngest";

import { dataRetention } from "./data-retention.js";
import { monitorProviderSpend } from "./provider-spend.js";
import {
  billPhoneNumbers,
  refreshBillingRates,
  expireBillingReservations,
  recoverPhoneNumberPurchases,
  reconcileProviderCallCosts,
  reconcileStripeWallet,
  terminateSilentBilledCalls,
  transitionLegacyBilling,
} from "./billing-maintenance.js";

// All inngest functions — passed to the serve handler in index.ts.
export const inngestFunctions: InngestFunction.Any[] = [
  monitorProviderSpend,
  refreshBillingRates,
  dataRetention,
  expireBillingReservations,
  recoverPhoneNumberPurchases,
  reconcileProviderCallCosts,
  reconcileStripeWallet,
  billPhoneNumbers,
  transitionLegacyBilling,
  terminateSilentBilledCalls,
];
