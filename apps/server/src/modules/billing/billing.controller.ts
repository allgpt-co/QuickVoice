import { authorized } from "../../middleware/authorize.middleware.js";
import * as billingService from "./billing.service.js";
import {
  getWalletSummary,
  getWalletTransactions,
} from "./billing-account.service.js";
import {
  createPaymentMethodSetup,
  createTopUpCheckout,
  updateAutoRecharge,
} from "./stripe-wallet.service.js";
import {
  callUsageSnapshotSchema,
  transactionListQuerySchema,
} from "./billing.schema.js";
import { toBillingJson } from "./billing-json.js";

export const getBillingUsage = authorized(async (req, res) => {
  const usage = await billingService.getBillingUsage(
    req.auth.activeOrganizationId
  );

  res.status(200).json({
    success: true,
    message: "Billing usage fetched successfully",
    data: usage,
  });
});

export const getSummary = authorized(async (req, res) => {
  const summary = await getWalletSummary(
    req.auth.activeOrganizationId,
    req.auth.userId,
  );
  res.status(200).json({
    success: true,
    message: "Wallet summary fetched successfully",
    data: toBillingJson(summary),
  });
});

export const getTransactions = authorized(async (req, res) => {
  const query = transactionListQuerySchema.parse(req.query);
  const result = await getWalletTransactions({
    organizationId: req.auth.activeOrganizationId,
    ...query,
  });
  res.status(200).json({
    success: true,
    message: "Wallet transactions fetched successfully",
    data: toBillingJson(result.items),
    nextCursor: result.nextCursor,
  });
});

export const createTopUp = authorized(async (req, res) => {
  const result = await createTopUpCheckout({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    input: req.body,
    idempotencyKey: headerValue(req.headers["idempotency-key"]),
  });
  res.status(201).json({
    success: true,
    message: "Top-up Checkout created successfully",
    data: result,
  });
});

export const setupPaymentMethod = authorized(async (req, res) => {
  const result = await createPaymentMethodSetup({
    organizationId: req.auth.activeOrganizationId,
  });
  res.status(201).json({
    success: true,
    message: "Payment method setup created successfully",
    data: result,
  });
});

export const configureAutoRecharge = authorized(async (req, res) => {
  const account = await updateAutoRecharge({
    organizationId: req.auth.activeOrganizationId,
    input: req.body,
  });
  res.status(200).json({
    success: true,
    message: "Automatic reload settings updated successfully",
    data: toBillingJson({
      enabled: account.autoRechargeEnabled,
      thresholdMicros: account.autoRechargeThresholdMicros,
      amountMicros: account.autoRechargeAmountMicros,
    }),
  });
});

export const ingestCallUsage = authorized(async (req, res) => {
  const input = callUsageSnapshotSchema.parse(req.body);
  // The implementation is loaded lazily to keep ordinary console billing
  // reads independent from the LiveKit metering path.
  const { applyCallUsageSnapshot } = await import("./call-metering.service.js");
  const result = await applyCallUsageSnapshot(input);
  res.status(result.action === "stop" ? 402 : 200).json({
    success: result.action !== "stop",
    message:
      result.action === "stop"
        ? "Insufficient credit; end the call"
        : "Call usage applied",
    data: toBillingJson(result),
  });
});

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
