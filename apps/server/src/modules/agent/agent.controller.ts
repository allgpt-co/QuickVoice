import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";

import * as agentService from "./agent.service.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { authorized } from "../../middleware/authorize.middleware.js";
import { recordAuditEvent } from "../audit/audit-log.service.js";

export const createAgent = authorized(async (req, res) => {
  const agent = await agentService.createAgent({
    ...req.body,
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Agent created successfully",
    data: agent,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "agent.created",
    resourceType: "agent",
    resourceId: agent.agentId,
  });
});

export const getAgents = authorized(async (req, res) => {
  const agents = await agentService.getAgents(req.auth.activeOrganizationId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agents fetched successfully",
    data: agents,
  });
});

export const getVoiceCatalog = authorized(async (_req, res) => {
  const catalog = await agentService.getVoiceCatalog();
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Voice catalog fetched successfully",
    data: catalog,
  });
});

export const createAgentPreviewSession = authorized(async (req, res) => {
  const agentId = req.params.agentId;
  if (typeof agentId !== "string" || agentId.length === 0) {
    throw new BadRequestError("Agent id is required");
  }

  const session = await agentService.createAgentPreviewSession(
    req.auth.activeOrganizationId,
    agentId,
    req.body?.dynamicVariables,
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent preview session created successfully",
    data: session,
  });
});

export const updateAgent = authorized(async (req, res) => {
  const agentId = req.params.id;
  if (typeof agentId !== "string" || agentId.length === 0) {
    throw new BadRequestError("Agent id is required");
  }
  const agent = await agentService.updateAgent(
    req.auth.activeOrganizationId,
    agentId,
    req.body,
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent updated successfully",
    data: agent,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "agent.updated",
    resourceType: "agent",
    resourceId: agent.agentId,
  });
});

export const deleteAgent = authorized(async (req, res) => {
  const agentId = req.params.agentId;
  if (typeof agentId !== "string" || agentId.length === 0) {
    throw new BadRequestError("Agent id is required");
  }

  const deletion = await agentService.requestAgentDeletion(
    req.auth.activeOrganizationId,
    agentId,
  );

  res.status(StatusCodes.ACCEPTED).json({
    success: true,
    message: "Agent deletion started",
    data: deletion,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "agent.deletion_requested",
    resourceType: "agent",
    resourceId: agentId,
  });
});

export const configureAgent = authorized(async (req, res) => {
  const agentId = req.params.agentId;
  if (typeof agentId !== "string" || agentId.length === 0) {
    throw new BadRequestError("Agent id is required");
  }

  const configuration = await agentService.configureAgent({
    ...req.body,
    agentId,
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent configured successfully",
    data: configuration,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "agent_configuration.updated",
    resourceType: "agent",
    resourceId: agentId,
  });
});

export const getAgentConfig = authorized(async (req, res) => {
  const agentId = req.params.agentId;
  if (typeof agentId !== "string" || agentId.length === 0) {
    throw new BadRequestError("Agent id is required");
  }

  const configuration = await agentService.getAgentConfig(
    req.auth.activeOrganizationId,
    agentId,
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent configuration fetched successfully",
    data: configuration,
  });
});

export const getAgentConfigByNumber = authorized(async (req, res) => {
  const phoneNumber = req.params.phoneNumber;
  if (typeof phoneNumber !== "string" || phoneNumber.length === 0) {
    throw new BadRequestError("Phone number is required");
  }

  const configuration = await agentService.getAgentConfigByNumber(phoneNumber);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent configuration fetched successfully",
    data: configuration,
  });
});

export const getAgentConfigByIdForRuntime = async (
  req: Request,
  res: Response,
) => {
  const agentId = req.params.agentId;
  if (typeof agentId !== "string" || agentId.length === 0) {
    throw new BadRequestError("Agent id is required");
  }

  const configuration =
    await agentService.getAgentConfigByIdForRuntime(agentId);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent configuration fetched successfully",
    data: configuration,
  });
};
