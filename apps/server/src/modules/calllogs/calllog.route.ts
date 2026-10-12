import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "../../common/errors/forbidden.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import validate from "../../middleware/validate.middleware.js";
import * as calllogController from "./calllog.controller.js";
import { callLogSchema } from "./calllog.schema.js";

// POST /calllogs is reserved for the internal server-to-server call path
// (the LiveKit agent runner posting a completed call via the Bearer token).
// Permission-based gating doesn't fit because the `callLogs` statement in
// lib/permissions.ts has no `create` action — this is an auth-method check.
const requireInternal = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (req.auth?.authMethod !== "internal") {
    return next(new ForbiddenError("calllogs ingest is internal-only"));
  }
  return next();
};

const router = Router();

router.post(
  "/",
  authMiddleware,
  requireInternal,
  validate(callLogSchema),
  calllogController.ingestCallLog
);

router.get(
  "/",
  authMiddleware,
  requirePermission({ callLogs: ["read"] }),
  calllogController.listCallLogs
);

router.get(
  "/live",
  authMiddleware,
  requirePermission({ callLogs: ["read"] }),
  calllogController.listLiveCalls
);

router.post(
  "/live/end",
  authMiddleware,
  requirePermission({ callLogs: ["delete"] }),
  calllogController.endLiveCall
);

router.get(
  "/:callId",
  authMiddleware,
  requirePermission({ callLogs: ["read"] }),
  calllogController.getCallLog
);

router.get(
  "/:callId/recording/download-url",
  authMiddleware,
  requirePermission({ callLogs: ["read"] }),
  calllogController.getCallRecordingDownloadUrl
);

router.get(
  "/:callId/transcripts",
  authMiddleware,
  requirePermission({ callLogs: ["read"] }),
  calllogController.getTranscripts
);

router.delete(
  "/:callId",
  authMiddleware,
  requirePermission({ callLogs: ["delete"] }),
  calllogController.deleteCallLog
);

export default router;
