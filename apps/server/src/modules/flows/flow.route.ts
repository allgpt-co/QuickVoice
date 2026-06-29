import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import validate from "../../middleware/validate.middleware.js";
import * as flowController from "./flow.controller.js";
import {
  createFlowSchema,
  flowTestRunSchema,
  updateFlowSchema,
} from "./flow.schema.js";

const router = Router();

router.get(
  "/",
  authMiddleware,
  requirePermission({ agent: ["read"] }),
  flowController.listFlows
);

router.post(
  "/",
  authMiddleware,
  requirePermission({ agent: ["update"] }),
  validate(createFlowSchema),
  flowController.createFlow
);

router.get(
  "/:flowId",
  authMiddleware,
  requirePermission({ agent: ["read"] }),
  flowController.getFlow
);

router.patch(
  "/:flowId",
  authMiddleware,
  requirePermission({ agent: ["update"] }),
  validate(updateFlowSchema),
  flowController.updateFlow
);

router.delete(
  "/:flowId",
  authMiddleware,
  requirePermission({ agent: ["update"] }),
  flowController.deleteFlow
);

router.post(
  "/:flowId/test-runs",
  authMiddleware,
  requirePermission({ agent: ["read"] }),
  validate(flowTestRunSchema),
  flowController.createTestRun
);

export default router;
