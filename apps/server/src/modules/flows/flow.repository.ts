import { Prisma } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import type { AgentFlowGraph } from "./flow.schema.js";
import type { CompiledAgentConfig, CompiledAgentFlow } from "./flow.compiler.js";

type FlowTransactionClient = Pick<Prisma.TransactionClient, "agentFlow">;
type FlowPrismaClient = {
  $transaction<T>(
    callback: (tx: FlowTransactionClient) => Promise<T>
  ): Promise<T>;
};

const defaultClient = prisma as unknown as FlowPrismaClient;

export interface FlowAgentRecord {
  agentId: string;
  name: string;
  isConfigured: boolean;
  configuration: CompiledAgentConfig | null;
}

export interface CreateFlowRepositoryInput {
  flowId: string;
  organizationId: string;
  userId: string | null;
  rootAgentId: string;
  name: string;
  description?: string;
  graphJson: AgentFlowGraph;
  compiledJson: CompiledAgentFlow | null;
  isActive: boolean;
}

export interface UpdateFlowRepositoryInput {
  rootAgentId?: string;
  name?: string;
  description?: string;
  graphJson?: AgentFlowGraph;
  compiledJson: CompiledAgentFlow | null;
  isActive?: boolean;
}

export const listFlows = (organizationId: string, rootAgentId?: string) =>
  prisma.agentFlow.findMany({
    where: { organizationId, ...(rootAgentId ? { rootAgentId } : {}) },
    orderBy: { updatedAt: "desc" },
  });

export const findFlowForOrg = (organizationId: string, flowId: string) =>
  prisma.agentFlow.findFirst({ where: { organizationId, flowId } });

export const getActiveFlowForRootAgent = (
  organizationId: string,
  rootAgentId: string
) =>
  prisma.agentFlow.findFirst({
    where: { organizationId, rootAgentId, isActive: true },
  });

export const findAgentsForOrg = async (
  organizationId: string,
  agentIds: string[]
): Promise<FlowAgentRecord[]> => {
  const agents = await prisma.agent.findMany({
    where: { organizationId, agentId: { in: agentIds } },
    select: {
      agentId: true,
      name: true,
      isConfigured: true,
      configuration: {
        select: {
          agentId: true,
          firstMessage: true,
          systemPrompt: true,
          llmModel: true,
          sttModel: true,
          ttsModel: true,
          voiceId: true,
          use_rag: true,
        },
      },
    },
  });

  return agents.map((agent) => ({
    agentId: agent.agentId,
    name: agent.name,
    isConfigured: agent.isConfigured,
    configuration: agent.configuration
      ? {
          agentId: agent.agentId,
          name: agent.name,
          firstMessage: agent.configuration.firstMessage,
          systemPrompt: agent.configuration.systemPrompt,
          llmModel: agent.configuration.llmModel,
          sttModel: agent.configuration.sttModel,
          ttsModel: agent.configuration.ttsModel,
          voiceId: agent.configuration.voiceId,
          use_rag: agent.configuration.use_rag,
        }
      : null,
  }));
};

export const createFlow = async (
  input: CreateFlowRepositoryInput,
  client: FlowPrismaClient = defaultClient
) =>
  client.$transaction(async (tx) => {
    if (input.isActive) {
      await tx.agentFlow.updateMany({
        where: {
          organizationId: input.organizationId,
          rootAgentId: input.rootAgentId,
        },
        data: { isActive: false },
      });
    }

    return tx.agentFlow.create({
      data: {
        flowId: input.flowId,
        organizationId: input.organizationId,
        userId: input.userId,
        rootAgentId: input.rootAgentId,
        name: input.name,
        description: input.description,
        graphJson: input.graphJson as unknown as Prisma.InputJsonValue,
        compiledJson:
          input.compiledJson === null
            ? Prisma.DbNull
            : (input.compiledJson as unknown as Prisma.InputJsonValue),
        isActive: input.isActive,
      },
    });
  });

export const updateFlow = async (
  organizationId: string,
  flowId: string,
  input: UpdateFlowRepositoryInput,
  client: FlowPrismaClient = defaultClient
) =>
  client.$transaction(async (tx) => {
    const existing = await tx.agentFlow.findFirst({
      where: { organizationId, flowId },
      select: { rootAgentId: true },
    });
    if (!existing) return null;

    const rootAgentId = input.rootAgentId ?? existing.rootAgentId;

    if (input.isActive) {
      await tx.agentFlow.updateMany({
        where: {
          organizationId,
          rootAgentId,
          flowId: { not: flowId },
        },
        data: { isActive: false },
      });
    }

    return tx.agentFlow.update({
      where: { flowId },
      data: {
        ...(input.rootAgentId !== undefined ? { rootAgentId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.graphJson !== undefined
          ? {
              graphJson: input.graphJson as unknown as Prisma.InputJsonValue,
            }
          : {}),
        compiledJson:
          input.compiledJson === null
            ? Prisma.DbNull
            : (input.compiledJson as unknown as Prisma.InputJsonValue),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  });

export const deleteFlow = (organizationId: string, flowId: string) =>
  prisma.agentFlow.deleteMany({ where: { organizationId, flowId } });
