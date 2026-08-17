import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { ForbiddenError } from "../../common/errors/forbidden.js";
import * as phoneService from "./phone.service.js";
import { searchNumbersSchema } from "./phone.schema.js";
import { authorized } from "../../middleware/authorize.middleware.js";
import { recordAuditEvent } from "../audit/audit-log.service.js";
import { toBillingJson } from "../billing/billing-json.js";


export const searchNumbers = authorized(async (req, res) => {
  // GET query params are validated inline — the shared validate middleware
  // only parses req.body. ZodError bubbles to the global error handler and is
  // mapped to a 400.
  const input = searchNumbersSchema.parse(req.query);
  const results = await phoneService.searchAvailableNumbers(
    input,
    req.auth.activeOrganizationId,
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Available numbers fetched successfully",
    data: toBillingJson(results),
  });
});

export const listNumbers = authorized(async (req, res) => {
  const numbers = await phoneService.listOrgNumbers(req.auth.activeOrganizationId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Phone numbers fetched successfully",
    data: toBillingJson(numbers),
  });
});

export const buyNumber = authorized(async (req, res) => {
  const number = await phoneService.buyNumber({
    ...req.body,
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth!.userId,
  });
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Phone number purchased successfully",
    data: toBillingJson(number),
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "phone_number.purchased",
    resourceType: "phone_number",
    resourceId: number.phId,
    metadata: { provider: number.provider },
  });
});

export const updateNumber = authorized(async (req, res) => {
  const phId = req.params.phId;
  if (typeof phId !== "string" || phId.length === 0) {
    throw new BadRequestError("Phone number id is required");
  }
  const updated = await phoneService.linkAgentToNumber({
    ...req.body,
    organizationId: req.auth.activeOrganizationId,
    phId,
  });
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Phone number updated successfully",
    data: toBillingJson(updated),
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "phone_number.updated",
    resourceType: "phone_number",
    resourceId: updated.phId,
    metadata: { agentId: updated.agentId },
  });
});

export const deleteNumber = authorized(async (req, res) => {
  const phId = req.params.phId;
  if (typeof phId !== "string" || phId.length === 0) {
    throw new BadRequestError("Phone number id is required");
  }
  await phoneService.deleteNumber(req.auth.activeOrganizationId, phId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Phone number released successfully",
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "phone_number.released",
    resourceType: "phone_number",
    resourceId: phId,
  });
});
