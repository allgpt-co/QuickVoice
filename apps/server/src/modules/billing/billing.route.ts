import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import * as billingController from "./billing.controller.js";
import validate from "../../middleware/validate.middleware.js";
import {
  createTopUpCheckoutSchema,
  updateAutoRechargeSchema,
} from "./billing.schema.js";
import { ForbiddenError } from "../../common/errors/forbidden.js";
import type { NextFunction, Request, Response } from "express";
import { requireBuiltInBillingManager } from "./billing-manager.middleware.js";

const router = Router();

const requireInternal = (req: Request, _res: Response, next: NextFunction) =>
  req.auth?.authMethod === "internal"
    ? next()
    : next(new ForbiddenError("Call usage ingest is internal-only"));

router.get(
  "/summary",
  authMiddleware,
  requirePermission({ billing: ["read"] }),
  billingController.getSummary,
);

router.get(
  "/transactions",
  authMiddleware,
  requirePermission({ billing: ["read"] }),
  billingController.getTransactions,
);

router.post(
  "/top-ups/checkout",
  authMiddleware,
  requirePermission({ billing: ["manage"] }),
  requireBuiltInBillingManager,
  validate(createTopUpCheckoutSchema),
  billingController.createTopUp,
);

router.post(
  "/payment-method/setup",
  authMiddleware,
  requirePermission({ billing: ["manage"] }),
  requireBuiltInBillingManager,
  billingController.setupPaymentMethod,
);

router.patch(
  "/auto-recharge",
  authMiddleware,
  requirePermission({ billing: ["manage"] }),
  requireBuiltInBillingManager,
  validate(updateAutoRechargeSchema),
  billingController.configureAutoRecharge,
);

router.post(
  "/calls/usage",
  authMiddleware,
  requireInternal,
  billingController.ingestCallUsage,
);

router.get(
  "/usage",
  authMiddleware,
  requirePermission({ callLogs: ["read"] }),
  billingController.getBillingUsage,
);

export default router;
