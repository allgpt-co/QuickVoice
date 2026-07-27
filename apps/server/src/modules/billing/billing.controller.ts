import { authorized } from "../../middleware/authorize.middleware.js";
import * as billingService from "./billing.service.js";

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
