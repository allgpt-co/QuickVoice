import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import * as billingController from "./billing.controller.js";

const router = Router();

router.get(
  "/usage",
  authMiddleware,
  requirePermission({ callLogs: ["read"] }),
  billingController.getBillingUsage
);

export default router;
