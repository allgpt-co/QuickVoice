import CustomApiError from "../../common/errors/customApiError.js";
import type { Prisma } from "../../../prisma/generated/prisma/client.js";
import { AgentWidgetSessionStatus } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import type {
  CreateAgentWidgetInput,
  UpdateAgentWidgetInput,
} from "./widget.schema.js";

export type AgentWidgetWithAgent = NonNullable<
  Awaited<ReturnType<typeof findWidgetForOrg>>
>;

export const listWidgetsForAgent = async (
  organizationId: string,
  agentId: string,
) =>
  prisma.agentWidget.findMany({
    where: { organizationId, agentId },
    orderBy: { createdAt: "desc" },
    include: {
      agent: { select: { agentId: true, name: true, isConfigured: true } },
    },
  });

export const findAgentForWidgetCreation = async (
  organizationId: string,
  agentId: string,
) =>
  prisma.agent.findFirst({
    where: { organizationId, agentId },
    select: { agentId: true, name: true, isConfigured: true },
  });

export const createWidget = async (
  organizationId: string,
  agentId: string,
  userId: string,
  widgetId: string,
  input: CreateAgentWidgetInput & { allowedOrigins: string[] },
) =>
  prisma.agentWidget.create({
    data: {
      widgetId,
      organizationId,
      agentId,
      name: input.name,
      enabled: input.enabled,
      allowedOrigins: input.allowedOrigins as Prisma.InputJsonValue,
      theme: input.theme as Prisma.InputJsonValue,
      consentRequired: input.consentRequired,
      consentText: input.consentText,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    include: {
      agent: { select: { agentId: true, name: true, isConfigured: true } },
    },
  });

export const findWidgetForOrg = async (
  organizationId: string,
  widgetId: string,
) =>
  prisma.agentWidget.findFirst({
    where: { organizationId, widgetId },
    include: {
      agent: { select: { agentId: true, name: true, isConfigured: true } },
    },
  });

export const findPublicWidget = async (widgetId: string) =>
  prisma.agentWidget.findUnique({
    where: { widgetId },
    include: {
      agent: {
        select: {
          agentId: true,
          name: true,
          isActive: true,
          isConfigured: true,
          configuration: true,
        },
      },
    },
  });

export const updateWidget = async (
  organizationId: string,
  widgetId: string,
  userId: string,
  input: UpdateAgentWidgetInput & { allowedOrigins?: string[] },
) => {
  const data: Prisma.AgentWidgetUpdateManyMutationInput = {
    ...("name" in input ? { name: input.name } : {}),
    ...("enabled" in input ? { enabled: input.enabled } : {}),
    ...("allowedOrigins" in input
      ? { allowedOrigins: input.allowedOrigins as Prisma.InputJsonValue }
      : {}),
    ...("theme" in input ? { theme: input.theme as Prisma.InputJsonValue } : {}),
    ...("consentRequired" in input
      ? { consentRequired: input.consentRequired }
      : {}),
    ...("consentText" in input ? { consentText: input.consentText } : {}),
    updatedByUserId: userId,
  };

  const result = await prisma.agentWidget.updateMany({
    where: { organizationId, widgetId },
    data,
  });
  if (result.count === 0) return null;
  return findWidgetForOrg(organizationId, widgetId);
};

export const deleteWidget = async (organizationId: string, widgetId: string) =>
  prisma.agentWidget.deleteMany({ where: { organizationId, widgetId } });

export const reserveWidgetSession = async (input: {
  sessionId: string;
  widgetId: string;
  organizationId: string;
  agentId: string;
  roomName: string;
  callId: string;
  participantIdentity: string;
  dispatchId?: string;
  origin: string | null;
  endTokenHash: string;
  expiresAt: Date;
  metadata: Prisma.InputJsonValue;
}, maxSessions: number) => prisma.$transaction(async (tx) => {
  // Serialize admission across API replicas, including sessions still starting.
  const widgets = await tx.$queryRaw<Array<{ widgetId: string }>>`
    SELECT "widgetId" FROM "AgentWidget" WHERE "widgetId" = ${input.widgetId} AND "enabled" = true FOR UPDATE
  `;
  if (widgets.length === 0) throw new CustomApiError("Widget not found", 404);
  const active = await tx.agentWidgetSession.count({
    where: {
      widgetId: input.widgetId,
      status: { in: [AgentWidgetSessionStatus.CREATED, AgentWidgetSessionStatus.ACTIVE] },
      expiresAt: { gt: new Date() },
    },
  });
  if (active >= maxSessions) throw new CustomApiError("This widget is at its concurrent call limit.", 429);
  return tx.agentWidgetSession.create({ data: { ...input, status: AgentWidgetSessionStatus.CREATED } });
});

export const activateWidgetSession = async (sessionId: string, dispatchId: string, expiresAt: Date) => {
  const result = await prisma.agentWidgetSession.updateMany({
    where: { sessionId, status: AgentWidgetSessionStatus.CREATED, expiresAt: { gt: new Date() } },
    data: { status: AgentWidgetSessionStatus.ACTIVE, dispatchId, expiresAt, startedAt: new Date() },
  });
  if (result.count !== 1) throw new Error("Widget session reservation is no longer available");
};

export const markWidgetSessionFailed = async (
  sessionId: string,
  metadata: Prisma.InputJsonValue,
) =>
  prisma.agentWidgetSession.updateMany({
    where: { sessionId },
    data: { status: AgentWidgetSessionStatus.FAILED, metadata },
  });

export const findSessionForEnd = async (
  widgetId: string,
  sessionId: string,
) =>
  prisma.agentWidgetSession.findFirst({
    where: { widgetId, sessionId },
  });

export const markSessionEnded = async (sessionId: string) =>
  prisma.agentWidgetSession.updateMany({
    where: { sessionId },
    data: {
      status: AgentWidgetSessionStatus.ENDED,
      endedAt: new Date(),
    },
  });

export const widgetRoomBelongsToOrg = async (
  organizationId: string,
  roomName: string,
) => {
  const count = await prisma.agentWidgetSession.count({
    where: { organizationId, roomName },
  });
  return count > 0;
};
