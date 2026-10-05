import { Router } from "express";

import authMiddleware, {
  requireInternalApiKey,
} from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import validate from "../../middleware/validate.middleware.js";
import * as agentController from "./agent.controller.js";
import {
  configureAgentSchema,
  createAgentSchema,
  updateAgentSchema,
} from "./agent.schema.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  requirePermission({ agent: ["create"] }),
  validate(createAgentSchema),
  agentController.createAgent,
);

router.get(
  "/",
  authMiddleware,
  requirePermission({ agent: ["read"] }),
  agentController.getAgents,
);

router.get(
  "/voice/catalog",
  authMiddleware,
  requirePermission({ agentConfiguration: ["read"] }),
  agentController.getVoiceCatalog,
);

router.post(
  "/:agentId/preview-session",
  authMiddleware,
  requirePermission({ agentPreview: ["create"] }),
  agentController.createAgentPreviewSession,
);

router.patch(
  "/:id",
  authMiddleware,
  requirePermission({ agent: ["update"] }),
  validate(updateAgentSchema),
  agentController.updateAgent,
);

router.delete(
  "/:agentId",
  authMiddleware,
  requirePermission({ agent: ["delete"] }),
  agentController.deleteAgent,
);

router.post(
  "/:agentId/config",
  authMiddleware,
  requirePermission({ agentConfiguration: ["create", "update"] }),
  validate(configureAgentSchema),
  agentController.configureAgent,
);

router.get(
  "/:agentId/config",
  authMiddleware,
  requirePermission({ agentConfiguration: ["read"] }),
  agentController.getAgentConfig,
);

router.get(
  "/internal-config/:agentId",
  requireInternalApiKey,
  agentController.getAgentConfigByIdForRuntime,
);

router.get(
  "/number-config/:phoneNumber",
  requireInternalApiKey,
  agentController.getAgentConfigByNumber,
);

export default router;
