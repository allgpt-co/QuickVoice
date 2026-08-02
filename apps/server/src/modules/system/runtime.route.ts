import { Router } from "express";

import { billingMode } from "../../config/billing-mode.js";
import { requireInternalApiKey } from "../../middleware/auth.middleware.js";

const router = Router();

/**
 * Minimal cross-service contract used by the AI runtime before it accepts
 * voice jobs. No customer or infrastructure configuration is exposed.
 */
router.get("/runtime-mode", requireInternalApiKey, (_req, res) => {
  res.json({
    success: true,
    data: {
      service: "server",
      runtimeProtocolVersion: 1,
      billingMode,
    },
  });
});

export default router;
