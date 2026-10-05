import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { authorized } from "../../middleware/authorize.middleware.js";
import { recordAuditEvent } from "../audit/audit-log.service.js";
import * as widgetService from "./widget.service.js";

export const listAgentWidgets = authorized(async (req, res) => {
  const agentId = stringParam(req.params.agentId, "Agent id is required");
  const widgets = await widgetService.listAgentWidgets(
    req.auth.activeOrganizationId,
    agentId,
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent widgets fetched successfully",
    data: widgets,
  });
});

export const createAgentWidget = authorized(async (req, res) => {
  const agentId = stringParam(req.params.agentId, "Agent id is required");
  const widget = await widgetService.createAgentWidget(
    req.auth.activeOrganizationId,
    agentId,
    req.auth.userId,
    req.body,
  );
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Agent widget created successfully",
    data: widget,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "agent_widget.created",
    resourceType: "agent_widget",
    resourceId: widget.widgetId,
  });
});

export const getAgentWidget = authorized(async (req, res) => {
  const widgetId = stringParam(req.params.widgetId, "Widget id is required");
  const widget = await widgetService.getAgentWidget(
    req.auth.activeOrganizationId,
    widgetId,
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent widget fetched successfully",
    data: widget,
  });
});

export const updateAgentWidget = authorized(async (req, res) => {
  const widgetId = stringParam(req.params.widgetId, "Widget id is required");
  const widget = await widgetService.updateAgentWidget(
    req.auth.activeOrganizationId,
    widgetId,
    req.auth.userId,
    req.body,
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent widget updated successfully",
    data: widget,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "agent_widget.updated",
    resourceType: "agent_widget",
    resourceId: widget.widgetId,
  });
});

export const deleteAgentWidget = authorized(async (req, res) => {
  const widgetId = stringParam(req.params.widgetId, "Widget id is required");
  await widgetService.deleteAgentWidget(
    req.auth.activeOrganizationId,
    widgetId,
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Agent widget deleted successfully",
    data: null,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "agent_widget.deleted",
    resourceType: "agent_widget",
    resourceId: widgetId,
  });
});

export const getPublicWidgetConfig = async (req: Request, res: Response) => {
  const widgetId = stringParam(req.params.widgetId, "Widget id is required");
  const config = await widgetService.getPublicWidgetConfig(widgetId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Widget config fetched successfully",
    data: config,
  });
};

export const createPublicWidgetSession = async (
  req: Request,
  res: Response,
) => {
  const widgetId = stringParam(req.params.widgetId, "Widget id is required");
  const session = await widgetService.createPublicWidgetSession(
    widgetId,
    req.headers.origin,
    req.body,
    clientIp(req),
  );
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Widget session created successfully",
    data: session,
  });
};

export const endPublicWidgetSession = async (req: Request, res: Response) => {
  const widgetId = stringParam(req.params.widgetId, "Widget id is required");
  const sessionId = stringParam(req.params.sessionId, "Session id is required");
  const result = await widgetService.endPublicWidgetSession(
    widgetId,
    sessionId,
    req.body.endToken,
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Widget session ended successfully",
    data: result,
  });
};

function stringParam(value: unknown, message: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestError(message);
  }
  return value.trim();
}

export function clientIp(req: Request) {
  // Express derives this only through the configured trusted-proxy chain.
  // Reading X-Forwarded-For directly lets callers manufacture rate-limit keys.
  return req.ip ?? req.socket.remoteAddress;
}
