import { StatusCodes } from "http-status-codes";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { authorized } from "../../middleware/authorize.middleware.js";
import { recordAuditEvent } from "../audit/audit-log.service.js";
import * as mcpService from "./mcp.service.js";

const getStringParam = (value: string | string[] | undefined, name: string) => {
  if (!value || Array.isArray(value)) {
    throw new BadRequestError(`${name} is required`);
  }
  return value;
};

const getQueryString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const getPositiveInt = (value: unknown, fallback: number, max?: number) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
};

export const listCatalog = authorized(async (req, res) => {
  const sort = getQueryString(req.query.sort) === "name" ? "name" : "popular";
  const verified = getQueryString(req.query.verified) === "true";
  const catalog = await mcpService.listCatalog(req.auth.activeOrganizationId, {
    page: getPositiveInt(req.query.page, 1),
    pageSize: getPositiveInt(req.query.pageSize, 24, 100),
    search: getQueryString(req.query.search)?.trim() || undefined,
    verified,
    sort,
  });
  res.status(StatusCodes.OK).json({ success: true, message: "MCP catalog fetched successfully", data: catalog });
});

export const listConnections = authorized(async (req, res) => {
  const connections = await mcpService.listConnections(req.auth.activeOrganizationId);
  res.status(StatusCodes.OK).json({ success: true, message: "MCP connections fetched successfully", data: connections });
});

export const connect = authorized(async (req, res) => {
  const connection = await mcpService.connect(req.auth.activeOrganizationId, req.auth.userId, req.body);
  res.status(StatusCodes.CREATED).json({ success: true, message: "MCP connection created successfully", data: connection });
});

export const refreshConnection = authorized(async (req, res) => {
  const mcpConnectionId = getStringParam(req.params.mcpConnectionId, "MCP connection ID");
  const connection = await mcpService.refreshConnection(req.auth.activeOrganizationId, mcpConnectionId);
  res.status(StatusCodes.OK).json({ success: true, message: "MCP connection refreshed successfully", data: connection });
});

export const listAgentConnections = authorized(async (req, res) => {
  const agentId = getStringParam(req.params.agentId, "Agent ID");
  const connections = await mcpService.listAgentConnections(req.auth.activeOrganizationId, agentId);
  res.status(StatusCodes.OK).json({ success: true, message: "Agent MCP connections fetched successfully", data: connections });
});

export const attach = authorized(async (req, res) => {
  const mcpConnectionId = getStringParam(req.params.mcpConnectionId, "MCP connection ID");
  const agentId = getStringParam(req.params.agentId, "Agent ID");
  const result = await mcpService.attach(req.auth.activeOrganizationId, agentId, mcpConnectionId, req.body.enabled ?? true);
  res.status(StatusCodes.OK).json({ success: true, message: "MCP connection attached successfully", data: result });
});

export const detach = authorized(async (req, res) => {
  const mcpConnectionId = getStringParam(req.params.mcpConnectionId, "MCP connection ID");
  const agentId = getStringParam(req.params.agentId, "Agent ID");
  await mcpService.detach(req.auth.activeOrganizationId, agentId, mcpConnectionId);
  res.status(StatusCodes.OK).json({ success: true, message: "MCP connection detached successfully", data: null });
});

export const disconnect = authorized(async (req, res) => {
  const mcpConnectionId = getStringParam(req.params.mcpConnectionId, "MCP connection ID");
  await mcpService.disconnect(req.auth.activeOrganizationId, mcpConnectionId);
  res.status(StatusCodes.OK).json({ success: true, message: "MCP connection disconnected successfully", data: null });
});

export const executeTool = authorized(async (req, res) => {
  const mcpConnectionId = getStringParam(req.params.mcpConnectionId, "MCP connection ID");
  const toolName = getStringParam(req.params.toolName, "MCP tool name");
  const result = await mcpService.executeTool(
    req.auth.activeOrganizationId,
    mcpConnectionId,
    toolName,
    req.body,
    { autonomous: req.auth.authMethod === "internal" },
  );
  res.status(StatusCodes.OK).json({ success: true, message: "MCP tool executed successfully", data: result });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "mcp.tool.executed",
    resourceType: "mcp_connection",
    resourceId: mcpConnectionId,
    metadata: { toolName, agentId: req.body?.agentId, callId: req.body?.callId },
  });
});
