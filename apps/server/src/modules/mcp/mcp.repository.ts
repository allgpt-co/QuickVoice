import { Prisma } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";

type JsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

export type CatalogSort = "popular" | "name";

export interface CatalogListParams {
  page: number;
  pageSize: number;
  search?: string;
  verified?: boolean;
  sort: CatalogSort;
}

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

export const listCatalogItems = async (params: CatalogListParams) => {
  const search = params.search?.trim();
  const baseWhere: Prisma.McpServerCatalogItemWhereInput = {
    organizationId: null,
    source: "SMITHERY",
  };
  const where: Prisma.McpServerCatalogItemWhereInput = {
    ...baseWhere,
    ...(params.verified ? { verified: true } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { mcpUrl: { contains: search, mode: "insensitive" } },
            { smitheryServerKey: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.McpServerCatalogItemOrderByWithRelationInput[] =
    params.sort === "name"
      ? [{ name: "asc" }]
      : [{ verified: "desc" }, { toolCount: "desc" }, { name: "asc" }];

  const [items, totalCount, catalogCount] = await prisma.$transaction([
    prisma.mcpServerCatalogItem.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.mcpServerCatalogItem.count({ where }),
    prisma.mcpServerCatalogItem.count({ where: baseWhere }),
  ]);

  return { items, totalCount, catalogCount };
};

export const findCatalogItemBySlug = (slug: string) =>
  prisma.mcpServerCatalogItem.findFirst({
    where: { organizationId: null, source: "SMITHERY", slug },
  });

export const findConnection = (organizationId: string, mcpConnectionId: string) =>
  prisma.mcpConnection.findFirst({
    where: { organizationId, mcpConnectionId },
    include: { agents: true },
  });

export const findConnectionForAgent = (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string
) =>
  prisma.mcpConnection.findFirst({
    where: {
      organizationId,
      mcpConnectionId,
      agents: { some: { agentId, enabled: true } },
    },
  });

export const upsertCustomCatalogItem = (data: {
  organizationId: string;
  slug: string;
  name: string;
  description: string;
  source: "CUSTOM";
  provider: string;
  mcpUrl: string;
  smitheryServerKey?: string | null;
  authType: string;
  categories: string[];
  verified: boolean;
  toolCount?: number;
  metadata?: unknown;
}) =>
  prisma.mcpServerCatalogItem.upsert({
    where: {
      organizationId_slug: {
        organizationId: data.organizationId,
        slug: data.slug,
      },
    },
    create: {
      ...data,
      categories: data.categories,
      metadata: jsonOrNull(data.metadata),
    },
    update: {
      name: data.name,
      description: data.description,
      provider: data.provider,
      mcpUrl: data.mcpUrl,
      authType: data.authType,
      categories: data.categories,
      verified: data.verified,
      toolCount: data.toolCount,
      metadata: jsonOrNull(data.metadata),
    },
  });

export const upsertConnection = (data: {
  organizationId: string;
  userId: string | null;
  catalogItemId?: string | null;
  displayName: string;
  mcpUrl: string;
  smitheryNamespace: string;
  smitheryConnectionId: string;
  status: "PENDING" | "CONNECTED" | "AUTH_REQUIRED" | "INPUT_REQUIRED" | "ERROR" | "DISCONNECTED";
  setupUrl?: string | null;
  tools?: unknown;
  metadata?: unknown;
  lastSyncedAt?: Date | null;
}) =>
  prisma.mcpConnection.upsert({
    where: {
      organizationId_smitheryConnectionId: {
        organizationId: data.organizationId,
        smitheryConnectionId: data.smitheryConnectionId,
      },
    },
    create: {
      ...data,
      tools: jsonOrNull(data.tools ?? []),
      metadata: jsonOrNull(data.metadata),
    },
    update: {
      catalogItemId: data.catalogItemId,
      displayName: data.displayName,
      mcpUrl: data.mcpUrl,
      status: data.status,
      setupUrl: data.setupUrl,
      tools: jsonOrNull(data.tools ?? []),
      metadata: jsonOrNull(data.metadata),
      lastSyncedAt: data.lastSyncedAt,
    },
  });

export const updateConnectionStatus = (
  organizationId: string,
  mcpConnectionId: string,
  data: {
    status: "PENDING" | "CONNECTED" | "AUTH_REQUIRED" | "INPUT_REQUIRED" | "ERROR" | "DISCONNECTED";
    setupUrl?: string | null;
    tools?: unknown;
    metadata?: unknown;
    lastSyncedAt?: Date | null;
  }
) =>
  prisma.mcpConnection.updateMany({
    where: { organizationId, mcpConnectionId },
    data: {
      status: data.status,
      setupUrl: data.setupUrl,
      tools: data.tools === undefined ? undefined : jsonOrNull(data.tools),
      metadata: data.metadata === undefined ? undefined : jsonOrNull(data.metadata),
      lastSyncedAt: data.lastSyncedAt,
    },
  });

export const attachConnection = async (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string,
  enabled = true
) => {
  const [agent, connection] = await Promise.all([
    prisma.agent.findFirst({ where: { organizationId, agentId }, select: { agentId: true } }),
    prisma.mcpConnection.findFirst({ where: { organizationId, mcpConnectionId }, select: { mcpConnectionId: true } }),
  ]);
  if (!agent || !connection) return null;

  return prisma.agentMcpConnection.upsert({
    where: { agentId_mcpConnectionId: { agentId, mcpConnectionId } },
    create: { organizationId, agentId, mcpConnectionId, enabled },
    update: { enabled },
  });
};

export const detachConnection = (organizationId: string, agentId: string, mcpConnectionId: string) =>
  prisma.agentMcpConnection.deleteMany({
    where: { organizationId, agentId, mcpConnectionId },
  });

export const deleteConnection = (organizationId: string, mcpConnectionId: string) =>
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
