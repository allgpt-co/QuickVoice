import { StatusCodes } from "http-status-codes";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { authorized } from "../../middleware/authorize.middleware.js";
import * as kbService from "./kb.service.js";
import {
  kbUploadUrlQuerySchema,
  listKbQuerySchema,
  updateKbApiSchema,
} from "./kb.schema.js";
import { createKbUploadUrl } from "./kb-upload.service.js";

export const createKnowledgeSources = authorized(async (req, res) => {
  const sources = await kbService.createKnowledgeSources({
    ...req.body,
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
  });
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Knowledge sources created",
    data: sources,
  });
});

export const listKnowledgeSources = authorized(async (req, res) => {
  const query = listKbQuerySchema.parse(req.query);
  const sources = await kbService.listKnowledgeSources({
    ...query,
    organizationId: req.auth.activeOrganizationId,
  });
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Knowledge sources fetched successfully",
    data: sources,
  });
});

export const updateKnowledgeSource = authorized(async (req, res) => {
  const kbId = req.params.kbId;
  if (typeof kbId !== "string" || kbId.length === 0) {
    throw new BadRequestError("Knowledge source id is required");
  }

  const input = updateKbApiSchema.parse(req.body);
  const source = await kbService.updateKnowledgeSource({
    ...input,
    kbId,
    organizationId: req.auth.activeOrganizationId,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Knowledge source updated and queued for processing",
    data: source,
  });
});

export const deleteKnowledgeSource = authorized(async (req, res) => {
  const kbId = req.params.kbId;
  if (typeof kbId !== "string" || kbId.length === 0) {
    throw new BadRequestError("Knowledge source id is required");
  }
  await kbService.deleteKnowledgeSource(req.auth.activeOrganizationId, kbId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Knowledge source deleted successfully",
  });
});

export const retryKnowledgeSource = authorized(async (req, res) => {
  const kbId = req.params.kbId;
  if (typeof kbId !== "string" || kbId.length === 0) {
    throw new BadRequestError("Knowledge source id is required");
  }
  const source = await kbService.retryKnowledgeSource(
    req.auth.activeOrganizationId,
    kbId,
  );
  res.status(StatusCodes.ACCEPTED).json({
    success: true,
    message: "Knowledge source queued for retry",
    data: source,
  });
});

// Returns a short-lived presigned S3 PUT URL so the browser can upload
// directly to S3 without routing through the server.
export const getUploadUrl = authorized(async (req, res) => {
  const query = kbUploadUrlQuerySchema.parse(req.query);
  const data = await createKbUploadUrl({
    ...query,
    organizationId: req.auth.activeOrganizationId,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Upload URL generated",
    data,
  });
});
