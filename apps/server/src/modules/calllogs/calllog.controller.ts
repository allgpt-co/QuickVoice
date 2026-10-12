import { StatusCodes } from "http-status-codes";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { ForbiddenError } from "../../common/errors/forbidden.js";
import { authorized } from "../../middleware/authorize.middleware.js";
import { recordAuditEvent } from "../audit/audit-log.service.js";
import { liveTranscriptStore } from "../../realtime/live-transcript.runtime.js";
import * as calllogService from "./calllog.service.js";
import {
  endLiveCallSchema,
  listCallLogsQuerySchema,
  listTranscriptsQuerySchema,
} from "./calllog.schema.js";

export const ingestCallLog = authorized(async (req, res) => {
  
  const callLog = await calllogService.ingestCallLog(req.body);
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Call log persisted",
    data: callLog,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "call_log.ingested",
    resourceType: "call_log",
    resourceId: callLog.callId,
    metadata: { authMethod: req.auth.authMethod, direction: callLog.direction },
  });
});

export const listCallLogs = authorized(async (req, res) => {
  // Query-string validation is inline because the shared validate middleware
  // only parses req.body. ZodError bubbles to the global error handler and is
  // mapped to a 400. Same pattern as searchNumbers in phone.controller.ts.
  const query = listCallLogsQuerySchema.parse(req.query);
  const { items, nextCursor } = await calllogService.listCallLogs({
    ...query,
    organizationId: req.auth.activeOrganizationId,
  });
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Call logs fetched successfully",
    data: items,
    nextCursor,
  });
});

export const listLiveCalls = authorized(async (req, res) => {
  const liveCalls = await calllogService.listLiveCalls(
    req.auth.activeOrganizationId,
    undefined,
    liveTranscriptStore
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Live calls fetched successfully",
    data: liveCalls,
  });
});

export const endLiveCall = authorized(async (req, res) => {
  const { roomName } = endLiveCallSchema.parse(req.body);
  const result = await calllogService.endLiveCall(
    req.auth.activeOrganizationId,
    roomName,
    undefined,
    liveTranscriptStore
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Live call ended successfully",
    data: result,
  });
  void recordAuditEvent({
    organizationId: req.auth.activeOrganizationId,
    userId: req.auth.userId,
    action: "call_log.live_call_ended",
    resourceType: "live_call",
    resourceId: roomName,
    metadata: { roomName },
  });
});

export const getCallLog = authorized(async (req, res) => {
  const callId = req.params.callId;
  if (typeof callId !== "string" || callId.length === 0) {
    throw new BadRequestError("Call id is required");
  }
  const callLog = await calllogService.getCallLog(
    req.auth.activeOrganizationId,
    callId
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Call log fetched successfully",
    data: callLog,
  });
});

export const getCallRecordingDownloadUrl = authorized(async (req, res) => {
  const callId = req.params.callId;
  if (typeof callId !== "string" || callId.length === 0) {
    throw new BadRequestError("Call id is required");
  }
  const url = await calllogService.getCallRecordingDownloadUrl(
    req.auth.activeOrganizationId,
    callId,
  );
  res.status(StatusCodes.OK).json({ success: true, data: { url } });
});

export const getTranscripts = authorized(async (req, res) => {
  const callId = req.params.callId;
  if (typeof callId !== "string" || callId.length === 0) {
    throw new BadRequestError("Call id is required");
  }
  const query = listTranscriptsQuerySchema.parse(req.query);
  const { items, nextCursor } = await calllogService.getTranscripts({
    ...query,
    organizationId: req.auth.activeOrganizationId,
    callId,
  });
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Transcripts fetched successfully",
    data: items,
    nextCursor,
  });
});

export const deleteCallLog = authorized(async (req, res) => {
  const callId = req.params.callId;
  if (typeof callId !== "string" || callId.length === 0) {
    throw new BadRequestError("Call id is required");
  }
  await calllogService.deleteCallLog(
    req.auth.activeOrganizationId,
    callId
  );
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Call log deleted successfully",
  });
});
