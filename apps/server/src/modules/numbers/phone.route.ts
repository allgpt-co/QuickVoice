import { Router, type RequestHandler } from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import validate from "../../middleware/validate.middleware.js";
import { requireBuiltInBillingManager } from "../billing/billing-manager.middleware.js";
import * as phoneController from "./phone.controller.js";
import { buyNumberSchema, updateNumberSchema } from "./phone.schema.js";

type PhoneRouterDeps = {
  authenticate?: RequestHandler;
  authorizeCreate?: RequestHandler;
  authorizeRead?: RequestHandler;
  authorizeUpdate?: RequestHandler;
  authorizeDelete?: RequestHandler;
  authorizeBillingManage?: RequestHandler;
  requireBillingManager?: RequestHandler;
  searchNumbers?: RequestHandler;
  listNumbers?: RequestHandler;
  buyNumber?: RequestHandler;
  updateNumber?: RequestHandler;
  deleteNumber?: RequestHandler;
};

export function createPhoneRouter(deps: PhoneRouterDeps = {}) {
  const router = Router();
  const authenticate = deps.authenticate ?? authMiddleware;
  const authorizeCreate =
    deps.authorizeCreate ?? requirePermission({ phoneNumber: ["create"] });
  const authorizeRead =
    deps.authorizeRead ?? requirePermission({ phoneNumber: ["read"] });
  const authorizeUpdate =
    deps.authorizeUpdate ?? requirePermission({ phoneNumber: ["update"] });
  const authorizeDelete =
    deps.authorizeDelete ?? requirePermission({ phoneNumber: ["delete"] });
  const authorizeBillingManage =
    deps.authorizeBillingManage ?? requirePermission({ billing: ["manage"] });
  const requireBillingManager =
    deps.requireBillingManager ?? requireBuiltInBillingManager;
  const searchNumbers = deps.searchNumbers ?? phoneController.searchNumbers;
  const listNumbers = deps.listNumbers ?? phoneController.listNumbers;
  const buyNumber = deps.buyNumber ?? phoneController.buyNumber;
  const updateNumber = deps.updateNumber ?? phoneController.updateNumber;
  const deleteNumber = deps.deleteNumber ?? phoneController.deleteNumber;

  // Search is proxied to the provider and does not write. It remains gated on
  // `create` because it is only useful as the first step of a purchase.
  router.get("/search", authenticate, authorizeCreate, searchNumbers);

  router.get("/", authenticate, authorizeRead, listNumbers);

  router.post(
    "/",
    authenticate,
    authorizeCreate,
    authorizeBillingManage,
    requireBillingManager,
    validate(buyNumberSchema),
    buyNumber,
  );

  router.patch(
    "/:phId",
    authenticate,
    authorizeUpdate,
    authorizeBillingManage,
    requireBillingManager,
    validate(updateNumberSchema),
    updateNumber,
  );

  router.delete(
    "/:phId",
    authenticate,
    authorizeDelete,
    authorizeBillingManage,
    requireBillingManager,
    deleteNumber,
  );

  return router;
}

export default createPhoneRouter();
