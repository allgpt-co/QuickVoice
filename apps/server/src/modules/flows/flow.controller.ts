import { StatusCodes } from "http-status-codes";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { authorized } from "../../middleware/authorize.middleware.js";
import * as flowService from "./flow.service.js";
import { listFlowsQuerySchema } from "./flow.schema.js";

const getStringParam = (value: string | string[] | undefined, name: string) => {
  if (!value || Array.isArray(value)) {
    throw new BadRequestError(`${name} is required`);
  }
  return value;
};

export const listFlows = authorized(async (req, res) => {
  const { rootAgentId } = listFlowsQuerySchema.parse(req.query);
  const flows = await flowService.listFlows(
    req.auth.activeOrganizationId,
    rootAgentId
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Flows fetched successfully",
    data: flows,
  });
});

export const getFlow = authorized(async (req, res) => {
  const flowId = getStringParam(req.params.flowId, "Flow ID");
  const flow = await flowService.getFlow(req.auth.activeOrganizationId, flowId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Flow fetched successfully",
    data: flow,
  });
});

export const createFlow = authorized(async (req, res) => {
  const flow = await flowService.createFlow({
    ...req.body,
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
  });
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Flow created successfully",
    data: flow,
  });
});

export const updateFlow = authorized(async (req, res) => {
  const flowId = getStringParam(req.params.flowId, "Flow ID");
  const flow = await flowService.updateFlow(
    req.auth.activeOrganizationId,
    flowId,
    req.body
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Flow updated successfully",
    data: flow,
  });
});

export const deleteFlow = authorized(async (req, res) => {
  const flowId = getStringParam(req.params.flowId, "Flow ID");
  await flowService.deleteFlow(req.auth.activeOrganizationId, flowId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Flow deleted successfully",
    data: null,
  });
});

export const createTestRun = authorized(async (req, res) => {
  const flowId = getStringParam(req.params.flowId, "Flow ID");
  const result = await flowService.createFlowTestRun(
    req.auth.activeOrganizationId,
    flowId,
    req.body
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Flow test run created successfully",
    data: result,
  });
});
