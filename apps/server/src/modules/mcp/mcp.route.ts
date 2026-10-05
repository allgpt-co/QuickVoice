import { ForbiddenError } from "../../common/errors/forbidden.js";
import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import validate from "../../middleware/validate.middleware.js";
import * as mcpController from "./mcp.controller.js";
import { attachMcpSchema, connectMcpSchema, executeMcpToolSchema } from "./mcp.schema.js";

const router = Router();

router.get(
  "/catalog",
  authMiddleware,
  requirePermission({ tools: ["read"] }),
  mcpController.listCatalog
);

router.get(
  "/connections",
  authMiddleware,
  requirePermission({ tools: ["read"] }),
  mcpController.listConnections
);

router.post(
  "/connections",
  authMiddleware,
  requirePermission({ tools: ["create"] }),
  validate(connectMcpSchema),
  mcpController.connect
);

router.post(
  "/connections/:mcpConnectionId/refresh",
  authMiddleware,
  requirePermission({ tools: ["update"] }),
  mcpController.refreshConnection
);

router.delete(
  "/connections/:mcpConnectionId",
  authMiddleware,
  requirePermission({ tools: ["delete"] }),
  mcpController.disconnect
);

router.get(
  "/agent/:agentId",
  authMiddleware,
  requirePermission({ tools: ["read"] }),
  mcpController.listAgentConnections
);

router.post(
  "/connections/:mcpConnectionId/attach/:agentId",
  authMiddleware,
  requirePermission({ tools: ["update"] }),
  validate(attachMcpSchema),
  mcpController.attach
);

router.delete(
  "/connections/:mcpConnectionId/detach/:agentId",
  authMiddleware,
  requirePermission({ tools: ["update"] }),
  mcpController.detach
);

router.post(
  "/connections/:mcpConnectionId/tools/:toolName/execute",
  authMiddleware,
  (req, _res, next) => req.auth?.authMethod === "apiKey"
    ? next(new ForbiddenError("Organization API keys cannot execute connected MCP tools"))
    : next(),
  // Remote tools can mutate provider data using the organization's OAuth grant.
  requirePermission({ tools: ["execute"] }),
  validate(executeMcpToolSchema),
  mcpController.executeTool
);

export default router;
