import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { BadRequestError } from "../../common/errors/badRequest.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/authorize.middleware.js";
import {
  batchUploadUrlQuerySchema,
  cancelOutboundCallSchema,
  createBatchCampaignSchema,
  listBatchCampaignsQuerySchema,
  listOutboundCallsQuerySchema,
  quickOutboundCallSchema,
} from "./outbound-call.schema.js";
import {
  assignExperimentVariants,
  buildCampaignReport,
  preflightCampaignPersonalization,
  validateConversionEvent,
} from "./outbound-campaign-intelligence.service.js";
import {
  campaignAssignmentRequestSchema,
  campaignConversionEventSchema,
  campaignPreflightRequestSchema,
  campaignReportRequestSchema,
} from "./outbound-campaign-intelligence.schema.js";
import {
  cancelBatchCampaign,
  createBatchCampaign,
  createBatchUploadUrl,
  exportBatchCampaignResultsCsv,
  getBatchCampaignDetail,
  listBatchCampaigns,
} from "./outbound-batch.service.js";
import {
  cancelOutboundCall,
  createQuickOutboundCall,
  getOutboundCall,
  listOutboundCalls,
  retryOutboundCall,
} from "./outbound-call.service.js";

type Middleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;
type CreateQuickOutboundCall = typeof createQuickOutboundCall;
type ListOutboundCalls = typeof listOutboundCalls;
type GetOutboundCall = typeof getOutboundCall;
type CancelOutboundCall = typeof cancelOutboundCall;
type RetryOutboundCall = typeof retryOutboundCall;
type CancelBatchCampaign = typeof cancelBatchCampaign;
type CreateBatchCampaign = typeof createBatchCampaign;
type CreateBatchUploadUrl = typeof createBatchUploadUrl;
type ListBatchCampaigns = typeof listBatchCampaigns;
type GetBatchCampaignDetail = typeof getBatchCampaignDetail;
type ExportBatchCampaignResultsCsv = typeof exportBatchCampaignResultsCsv;

type OutboundCallRouterDeps = {
  authMiddleware?: Middleware;
  requireCreatePermission?: Middleware;
  requireReadPermission?: Middleware;
  requireDeletePermission?: Middleware;
  createQuickOutboundCall?: CreateQuickOutboundCall;
  listOutboundCalls?: ListOutboundCalls;
  getOutboundCall?: GetOutboundCall;
  cancelOutboundCall?: CancelOutboundCall;
  retryOutboundCall?: RetryOutboundCall;
  cancelBatchCampaign?: CancelBatchCampaign;
  createBatchCampaign?: CreateBatchCampaign;
  createBatchUploadUrl?: CreateBatchUploadUrl;
  listBatchCampaigns?: ListBatchCampaigns;
  getBatchCampaignDetail?: GetBatchCampaignDetail;
  exportBatchCampaignResultsCsv?: ExportBatchCampaignResultsCsv;
};

export function createOutboundCallRouter(deps: OutboundCallRouterDeps = {}) {
  const router = Router();
  const authenticate = deps.authMiddleware ?? authMiddleware;
  const authorizeCreate =
    deps.requireCreatePermission ??
    requirePermission({ outboundCalls: ["create"] });
  const authorizeRead =
    deps.requireReadPermission ??
    requirePermission({ outboundCalls: ["read"] });
  const authorizeDelete =
    deps.requireDeletePermission ??
    requirePermission({ outboundCalls: ["delete"] });
  const dispatchQuickCall =
    deps.createQuickOutboundCall ?? createQuickOutboundCall;
  const fetchOutboundCalls = deps.listOutboundCalls ?? listOutboundCalls;
  const fetchOutboundCall = deps.getOutboundCall ?? getOutboundCall;
  const cancelOutbound = deps.cancelOutboundCall ?? cancelOutboundCall;
  const retryOutbound = deps.retryOutboundCall ?? retryOutboundCall;
  const cancelBatch = deps.cancelBatchCampaign ?? cancelBatchCampaign;
  const createBatch = deps.createBatchCampaign ?? createBatchCampaign;
  const createUploadUrl = deps.createBatchUploadUrl ?? createBatchUploadUrl;
  const listBatches = deps.listBatchCampaigns ?? listBatchCampaigns;
  const getBatchDetail = deps.getBatchCampaignDetail ?? getBatchCampaignDetail;
  const exportBatchResults =
    deps.exportBatchCampaignResultsCsv ?? exportBatchCampaignResultsCsv;

  router.get(
    "/",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const query = listOutboundCallsQuerySchema.parse(req.query);
        const data = await fetchOutboundCalls({
          ...query,
          organizationId,
        });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Outbound calls fetched successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/quick",
    authenticate,
    authorizeCreate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const requestAuth = getRequiredAuth(req);

        const input = quickOutboundCallSchema.parse(req.body);
        const data = await dispatchQuickCall({
          ...input,
          organizationId: requestAuth.organizationId,
          userId: requestAuth.userId,
        });

        res.status(StatusCodes.CREATED).json({
          success: true,
          message: "Outbound call dispatched successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/batch-upload-url",
    authenticate,
    authorizeCreate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const query = batchUploadUrlQuerySchema.parse(req.query);
        const data = await createUploadUrl({
          ...query,
          organizationId,
        });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Batch upload URL generated",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/batches",
    authenticate,
    authorizeCreate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = getRequiredAuth(req);
        const input = createBatchCampaignSchema.parse(req.body);
        const data = await createBatch({
          ...input,
          organizationId,
          userId,
        });

        res.status(StatusCodes.CREATED).json({
          success: true,
          message: "Batch campaign created",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/batches",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const query = listBatchCampaignsQuerySchema.parse(req.query);
        const data = await listBatches({
          ...query,
          organizationId,
        });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Batch campaigns fetched successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/batches/:campaignId/personalization/preflight",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        getRequiredAuth(req);
        const campaignId = getCampaignId(req);
        const input = campaignPreflightRequestSchema.parse(req.body);
        const data = preflightCampaignPersonalization(input);

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Campaign personalization preflight completed",
          data: { campaignId, ...data },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/batches/:campaignId/experiments/assignments",
    authenticate,
    authorizeCreate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        getRequiredAuth(req);
        const campaignId = getCampaignId(req);
        const input = campaignAssignmentRequestSchema.parse(req.body);
        const data = assignExperimentVariants(input);

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Campaign experiment assignments computed",
          data: { campaignId, ...data },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/batches/:campaignId/conversions/validate",
    authenticate,
    authorizeCreate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        getRequiredAuth(req);
        const campaignId = getCampaignId(req);
        const input = campaignConversionEventSchema.parse(req.body);
        const data = validateConversionEvent(input);

        res
          .status(data.accepted ? StatusCodes.OK : StatusCodes.BAD_REQUEST)
          .json({
            success: data.accepted,
            message: data.accepted
              ? "Campaign conversion validated"
              : "Campaign conversion rejected",
            data: { campaignId, ...data },
          });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/batches/:campaignId/reports/preview",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        getRequiredAuth(req);
        const campaignId = getCampaignId(req);
        const input = campaignReportRequestSchema.parse(req.body);
        const data = buildCampaignReport(input);

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Campaign report preview generated",
          data: { campaignId, ...data },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/batches/:campaignId/results.csv",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const campaignId = getCampaignId(req);
        const data = await exportBatchResults({
          organizationId,
          campaignId,
        });

        res
          .status(StatusCodes.OK)
          .set({
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${data.filename}"`,
          })
          .send(data.content);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/batches/:campaignId",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const campaignId = getCampaignId(req);
        const data = await getBatchDetail({
          organizationId,
          campaignId,
        });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Batch campaign fetched successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/batches/:campaignId/cancel",
    authenticate,
    authorizeDelete,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const campaignId = getCampaignId(req);
        const data = await cancelBatch({ organizationId, campaignId });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Batch campaign cancelled successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:outboundId/status",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const outboundId = getOutboundId(req);
        const outbound = await fetchOutboundCall({
          organizationId,
          outboundId,
        });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Outbound call status fetched successfully",
          data: {
            outboundId: outbound.outboundId,
            status: outbound.status,
            failureReason: outbound.failureReason,
            updatedAt: outbound.updatedAt,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:outboundId",
    authenticate,
    authorizeRead,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId } = getRequiredAuth(req);
        const outboundId = getOutboundId(req);
        const data = await fetchOutboundCall({ organizationId, outboundId });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Outbound call fetched successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:outboundId/cancel",
    authenticate,
    authorizeDelete,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = getRequiredAuth(req);
        const outboundId = getOutboundId(req);
        const input = cancelOutboundCallSchema.parse(req.body ?? {});
        const data = await cancelOutbound({
          organizationId,
          userId,
          outboundId,
          reason: input.reason,
        });

        res.status(StatusCodes.OK).json({
          success: true,
          message: "Outbound call cancelled successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:outboundId/retry",
    authenticate,
    authorizeCreate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = getRequiredAuth(req);
        const outboundId = getOutboundId(req);
        const data = await retryOutbound({
          organizationId,
          userId,
          outboundId,
        });

        res.status(StatusCodes.CREATED).json({
          success: true,
          message: "Outbound call retry dispatched successfully",
          data,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export default createOutboundCallRouter();

function getRequiredAuth(req: Request) {
  const requestAuth = req.auth;
  if (!requestAuth?.activeOrganizationId) {
    throw new BadRequestError("Active organization is required");
  }

  return {
    organizationId: requestAuth.activeOrganizationId,
    userId: requestAuth.userId,
  };
}

function getOutboundId(req: Request) {
  const outboundId = req.params.outboundId;
  if (typeof outboundId !== "string" || outboundId.length === 0) {
    throw new BadRequestError("Outbound call id is required");
  }
  return outboundId;
}

function getCampaignId(req: Request) {
  const campaignId = req.params.campaignId;
  if (typeof campaignId !== "string" || campaignId.length === 0) {
    throw new BadRequestError("Campaign id is required");
  }
  return campaignId;
}
