import { Router } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import validate from "../../middleware/validate.middleware.js";
import * as kbController from "./kb.controller.js";
import {
  createKbApiSchema,
  updateKbApiSchema,
} from "./kb.schema.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  requirePermission({ knowledgeSource: ["create"] }),
  validate(createKbApiSchema),
  kbController.createKnowledgeSources,
);

router.get(
  "/",
  authMiddleware,
  requirePermission({ knowledgeSource: ["read"] }),
  kbController.listKnowledgeSources,
);

// Returns a presigned S3 PUT URL for direct browser-to-S3 file upload.
// Query params: fileName (string), contentType (MIME string)
router.get(
  "/upload-url",
  authMiddleware,
  requirePermission({ knowledgeSource: ["create"] }),
  kbController.getUploadUrl,
);

router.post(
  "/:kbId/retry",
  authMiddleware,
  requirePermission({ knowledgeSource: ["create"] }),
  kbController.retryKnowledgeSource,
);

router.patch(
  "/:kbId",
  authMiddleware,
  requirePermission({ knowledgeSource: ["update"] }),
  validate(updateKbApiSchema),
  kbController.updateKnowledgeSource,
);

router.delete(
  "/:kbId",
  authMiddleware,
  requirePermission({ knowledgeSource: ["delete"] }),
  kbController.deleteKnowledgeSource,
);

export default router;
