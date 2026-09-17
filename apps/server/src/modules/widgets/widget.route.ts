import type { RequestHandler } from "express";
import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import validate from "../../middleware/validate.middleware.js";
import * as widgetController from "./widget.controller.js";
import {
  createAgentWidgetSchema,
  createPublicWidgetSessionSchema,
  endPublicWidgetSessionSchema,
  updateAgentWidgetSchema,
} from "./widget.schema.js";
import { publicWidgetOriginAllowed } from "./widget.service.js";
import { setPublicWidgetCorsHeaders } from "./public-widget-cors.js";

const router = Router();

const publicWidgetCors: RequestHandler = async (req, res, next) => {
  try {
    const origin = req.headers.origin;
    const widgetId = req.params.widgetId;
    const allowed =
      typeof widgetId === "string" &&
      (await publicWidgetOriginAllowed(widgetId, origin));

    if (allowed && origin) {
      setPublicWidgetCorsHeaders(res, origin);
    }

    if (req.method === "OPTIONS") {
      res.status(allowed ? 204 : 403).end();
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

router.options("/public/widgets/:widgetId/config", publicWidgetCors);
router.options("/public/widgets/:widgetId/sessions", publicWidgetCors);
router.options(
  "/public/widgets/:widgetId/sessions/:sessionId/end",
  publicWidgetCors,
);

router.get(
  "/public/widgets/:widgetId/config",
  publicWidgetCors,
  widgetController.getPublicWidgetConfig,
);

router.post(
  "/public/widgets/:widgetId/sessions",
  publicWidgetCors,
  validate(createPublicWidgetSessionSchema),
  widgetController.createPublicWidgetSession,
);

router.post(
  "/public/widgets/:widgetId/sessions/:sessionId/end",
  publicWidgetCors,
  validate(endPublicWidgetSessionSchema),
  widgetController.endPublicWidgetSession,
);

router.get(
  "/agents/:agentId/widgets",
  authMiddleware,
  requirePermission({ agentWidget: ["read"] }),
  widgetController.listAgentWidgets,
);

router.post(
  "/agents/:agentId/widgets",
  authMiddleware,
  requirePermission({ agentWidget: ["create"] }),
  validate(createAgentWidgetSchema),
  widgetController.createAgentWidget,
);

router.get(
  "/widgets/:widgetId",
  authMiddleware,
  requirePermission({ agentWidget: ["read"] }),
  widgetController.getAgentWidget,
);

router.patch(
  "/widgets/:widgetId",
  authMiddleware,
  requirePermission({ agentWidget: ["update"] }),
  validate(updateAgentWidgetSchema),
  widgetController.updateAgentWidget,
);

router.delete(
  "/widgets/:widgetId",
  authMiddleware,
  requirePermission({ agentWidget: ["delete"] }),
  widgetController.deleteAgentWidget,
);

export default router;
