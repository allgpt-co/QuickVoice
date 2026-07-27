import prisma from "../../config/prisma.js";
import { Prisma } from "../../../prisma/generated/prisma/client.js";
import type { CreateToolArgs, UpdateToolInput } from "./tool.schema.js";

type CreateToolRepoArgs = CreateToolArgs & { toolId: string };

const normalizeCreateToolData = (
  data: CreateToolRepoArgs,
): Prisma.ToolUncheckedCreateInput => ({
  ...data,
  api_headers: data.api_headers === null ? Prisma.JsonNull : data.api_headers,
  api_body: data.api_body === null ? Prisma.JsonNull : data.api_body,
  api_query_params:
    data.api_query_params === null ? Prisma.JsonNull : data.api_query_params,
  api_path_params:
    data.api_path_params === null ? Prisma.JsonNull : data.api_path_params,
  dynamic_variables:
    data.dynamic_variables === null ? Prisma.JsonNull : data.dynamic_variables,
});

const normalizeUpdateToolData = (
  data: UpdateToolInput,
): Prisma.ToolUncheckedUpdateManyInput => ({
  ...data,
  api_headers: data.api_headers === null ? Prisma.JsonNull : data.api_headers,
  api_body: data.api_body === null ? Prisma.JsonNull : data.api_body,
  api_query_params:
    data.api_query_params === null ? Prisma.JsonNull : data.api_query_params,
  api_path_params:
    data.api_path_params === null ? Prisma.JsonNull : data.api_path_params,
  dynamic_variables:
    data.dynamic_variables === null ? Prisma.JsonNull : data.dynamic_variables,
});

export const listTools = (organizationId: string) =>
  prisma.tool.findMany({
    where: { organizationId },
    include: { agent: { select: { agentId: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

export const findTool = (organizationId: string, toolId: string) =>
  prisma.tool.findFirst({ where: { toolId, organizationId } });

export const createTool = (data: CreateToolRepoArgs) =>
  prisma.tool.create({ data: normalizeCreateToolData(data) });

export const updateTool = async (
  organizationId: string,
  toolId: string,
  data: UpdateToolInput,
) => {
  const result = await prisma.tool.updateMany({
    where: { toolId, organizationId },
    data: normalizeUpdateToolData(data),
  });
  if (result.count === 0) return null;
  return prisma.tool.findUnique({ where: { toolId } });
};

export const deleteTool = (organizationId: string, toolId: string) =>
  prisma.tool.deleteMany({ where: { toolId, organizationId } });

export const getAgentTools = async (
  organizationId: string,
  agentId: string,
) => {
  const agent = await prisma.agent.findFirst({
    where: { agentId, organizationId },
    include: { tools: true },
  });
  return agent?.tools ?? null;
};

export const attachTool = async (
  organizationId: string,
  agentId: string,
  toolId: string,
) => {
  return prisma.$transaction(async (tx) => {
    const [agent, tool] = await Promise.all([
      tx.agent.findFirst({
        where: { agentId, organizationId },
        select: {
          agentId: true,
          tools: { where: { toolId }, select: { toolId: true } },
        },
      }),
      tx.tool.findFirst({
        where: { toolId, organizationId },
        select: { toolId: true },
      }),
    ]);
    if (!agent || !tool) return null;

    if (agent.tools.length === 0) {
      await tx.agent.update({
        where: { agentId },
        data: { tools: { connect: { toolId } } },
      });
    }

    return syncAgentToolsCount(tx, agentId);
  });
};

export const detachTool = async (
  organizationId: string,
  agentId: string,
  toolId: string,
) => {
  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({
      where: { agentId, organizationId },
      select: {
        agentId: true,
        tools: { where: { toolId }, select: { toolId: true } },
      },
    });
    if (!agent) return null;

    if (agent.tools.length > 0) {
      await tx.agent.update({
        where: { agentId },
        data: { tools: { disconnect: { toolId } } },
      });
    }

    return syncAgentToolsCount(tx, agentId);
  });
};

const syncAgentToolsCount = async (
  tx: Prisma.TransactionClient,
  agentId: string,
) => {
  const counted = await tx.agent.findUnique({
    where: { agentId },
    select: { _count: { select: { tools: true } } },
  });
  return tx.agent.update({
    where: { agentId },
    data: { toolsCount: counted?._count.tools ?? 0 },
  });
};
