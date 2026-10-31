import { Prisma } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";

type JsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

const jsonOrNull = (value: unknown): JsonValue =>
  value === undefined || value === null
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);

export const listConnections = (organizationId: string) =>
  prisma.mcpConnection.findMany({
    where: { organizationId },
    include: {
      catalogItem: true,
      agents: { include: { agent: { select: { agentId: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

export const findConnection = (
  organizationId: string,
  mcpConnectionId: string,
) =>
  prisma.mcpConnection.findFirst({
    where: { organizationId, mcpConnectionId },
    include: { agents: true },
  });

export const findConnectionForAgent = (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string,
) =>
  prisma.mcpConnection.findFirst({
    where: {
      organizationId,
      mcpConnectionId,
      agents: { some: { agentId, enabled: true } },
    },
  });

export const upsertConnection = (data: {
  organizationId: string;
  userId: string | null;
  connectionKey: string;
  displayName: string;
  mcpUrl: string;
  toolkitSlug: string;
  providerUserId: string;
  metadata?: unknown;
}) =>
  prisma.mcpConnection.upsert({
    where: {
      organizationId_provider_connectionKey: {
        organizationId: data.organizationId,
        provider: "composio",
        connectionKey: data.connectionKey,
      },
    },
    create: {
      ...data,
      provider: "composio",
      status: "PENDING",
      tools: [],
      metadata: jsonOrNull(data.metadata),
    },
    // Repeated clicks reuse the saved account; they must not reset authorization.
    update: { displayName: data.displayName },
  });

export const updateConnectionStatus = (
  organizationId: string,
  mcpConnectionId: string,
  data: {
    status:
      | "PENDING"
      | "CONNECTED"
      | "AUTH_REQUIRED"
      | "INPUT_REQUIRED"
      | "ERROR"
      | "DISCONNECTED";
    setupUrl?: string | null;
    tools?: unknown;
    metadata?: unknown;
    lastSyncedAt?: Date | null;
    providerAccountId?: string | null;
    providerSessionId?: string | null;
  },
  expectedUpdatedAt?: Date,
) =>
  prisma.mcpConnection.updateMany({
    where: {
      organizationId,
      mcpConnectionId,
      ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
    },
    data: {
      status: data.status,
      providerAccountId: data.providerAccountId,
      providerSessionId: data.providerSessionId,
      ...(expectedUpdatedAt
        ? {
            updatedAt: new Date(
              Math.max(Date.now(), expectedUpdatedAt.getTime() + 1),
            ),
          }
        : {}),
      setupUrl: data.setupUrl,
      tools: data.tools === undefined ? undefined : jsonOrNull(data.tools),
      metadata:
        data.metadata === undefined ? undefined : jsonOrNull(data.metadata),
      lastSyncedAt: data.lastSyncedAt,
    },
  });

export const attachConnection = async (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string,
  enabled = true,
) => {
  const [agent, connection] = await Promise.all([
    prisma.agent.findFirst({
      where: { organizationId, agentId },
      select: { agentId: true },
    }),
    prisma.mcpConnection.findFirst({
      where: { organizationId, mcpConnectionId },
      select: { mcpConnectionId: true },
    }),
  ]);
  if (!agent || !connection) return null;

  return prisma.agentMcpConnection.upsert({
    where: { agentId_mcpConnectionId: { agentId, mcpConnectionId } },
    create: { organizationId, agentId, mcpConnectionId, enabled },
    update: { enabled },
  });
};

export const detachConnection = (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string,
) =>
  prisma.agentMcpConnection.deleteMany({
    where: { organizationId, agentId, mcpConnectionId },
  });

export const deleteConnection = (
  organizationId: string,
  mcpConnectionId: string,
) =>
  prisma.$transaction([
    prisma.agentMcpConnection.deleteMany({
      where: { organizationId, mcpConnectionId },
    }),
    prisma.mcpConnection.deleteMany({
      where: { organizationId, mcpConnectionId },
    }),
  ]);

export const listAgentConnections = (organizationId: string, agentId: string) =>
  prisma.agentMcpConnection.findMany({
    where: { organizationId, agentId },
    include: { mcpConnection: { include: { catalogItem: true } } },
    orderBy: { createdAt: "desc" },
  });

export const createExecutionLog = (data: {
  organizationId: string;
  agentId?: string | null;
  mcpConnectionId: string;
  toolName: string;
  callId?: string | null;
  status: string;
  latencyMs?: number | null;
  argumentsPreview?: unknown;
  resultPreview?: unknown;
  error?: string | null;
}) =>
  prisma.mcpToolExecutionLog.create({
    data: {
      ...data,
      argumentsPreview: jsonOrNull(data.argumentsPreview),
      resultPreview: jsonOrNull(data.resultPreview),
    },
  });

// A database lease serializes setup across API replicas without holding a DB
// transaction open while an external OAuth provider responds.
export const claimConnectionSetup = (
  organizationId: string,
  mcpConnectionId: string,
  leaseUntil: Date,
) =>
  prisma.mcpConnection.updateMany({
    where: {
      organizationId,
      mcpConnectionId,
      OR: [{ setupLeaseUntil: null }, { setupLeaseUntil: { lt: new Date() } }],
    },
    data: { setupLeaseUntil: leaseUntil },
  });
export const releaseConnectionSetup = (
  organizationId: string,
  mcpConnectionId: string,
  leaseUntil: Date,
) =>
  prisma.mcpConnection.updateMany({
    where: { organizationId, mcpConnectionId, setupLeaseUntil: leaseUntil },
    data: { setupLeaseUntil: null },
  });
