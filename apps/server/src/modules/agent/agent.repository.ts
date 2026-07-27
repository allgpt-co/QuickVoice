import { Prisma } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import type { CreateAgentArgs, UpdateAgentInput, ConfigureAgentInput } from "./agent.schema.js";

type CreateAgentInput = CreateAgentArgs & { agentSlug: string };
type UpdateAgentRepoInput = UpdateAgentInput & { agentSlug?: string };

const agentConfigCreateDefaults = {
  concurrent_calls_limit: 5,
  daily_calls_limit: 20,
  max_conversation_duration_seconds: 600,
  silence_end_call_timeout_seconds: 30,
  turn_timeout_seconds: 30,
  user_input_audio_format: "mp3",
  store_call_audio: true,
  zero_pii_retention: false,
  conversation_retention_days: 30,
  enable_auth_for_agent_api: false,
  voice_similarity_boost: 0.5,
  voice_speed: 1.0,
  voice_stability: 0.5,
};

function toPrismaConfigData(data: ConfigureAgentInput) {
  return {
    ...data,
    initiation_webhook: data.initiation_webhook ?? Prisma.JsonNull,
    post_call_webhook: data.post_call_webhook ?? Prisma.JsonNull,
  };
}

export const createAgent = async (agent: CreateAgentInput) => {
  const newAgent = await prisma.agent.create({
    data: agent,
  });
  return newAgent;
};

export const createAgentWithConfiguration = async (
  agent: CreateAgentInput,
  configuration: ConfigureAgentInput
) => {
  return prisma.$transaction(async (tx) => {
    const newAgent = await tx.agent.create({
      data: { ...agent, isConfigured: true },
    });

    await tx.agentConfiguration.create({
      data: {
        agentId: newAgent.agentId,
        ...agentConfigCreateDefaults,
        ...toPrismaConfigData(configuration),
      },
    });

    return newAgent;
  });
};

export const findBySlug = async (
  organizationId: string,
  agentSlug: string
) => {
  return prisma.agent.findUnique({
    where: {
      organizationId_agentSlug: {
        organizationId,
        agentSlug,
      },
    },
  });
};

export const findByIdForOrg = async (
  organizationId: string,
  agentId: string
) =>
  prisma.agent.findFirst({
    where: { agentId, organizationId },
    select: { agentId: true },
  });


export const getAgents = async (organizationId: string) => {
  return prisma.agent.findMany({
    where: {
      organizationId,
    },
  });
};

export const updateAgent = async (
  organizationId: string,
  agentId: string,
  data: UpdateAgentRepoInput
) => {
  // updateMany with a composite {agentId, organizationId} predicate is the
  // tenant-safe write: a row that belongs to another org yields count: 0
  // instead of being updated.
  const result = await prisma.agent.updateMany({
    where: { agentId, organizationId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.agent.findUnique({ where: { agentId } });
};

export const deleteAgent = async (
  organizationId: string,
  agentId: string
) => {
  return prisma.$transaction(async (tx) => {
    await tx.secret.deleteMany({
      where: {
        organizationId,
        name: { startsWith: `agent:${agentId}:` },
      },
    });
    return tx.agent.deleteMany({
      where: { agentId, organizationId },
    });
  });
};

export const getAgentDeletionContext = async (
  organizationId: string,
  agentId: string
) =>
  prisma.agent.findFirst({
    where: { agentId, organizationId },
    select: {
      agentId: true,
      phoneNumbers: {
        select: { phId: true },
      },
      knowledgeSources: {
        select: {
          kbId: true,
          agentId: true,
          storagePath: true,
          sourceType: true,
        },
      },
    },
  });

export const configureAgent = async (
  organizationId: string,
  agentId: string,
  data: ConfigureAgentInput
) => {
  // Tenant pre-check — bail early with null (service maps to NotFoundError).
  // findUnique on the PK, then compare org, is cheaper than a composite findFirst.
  const agent = await prisma.agent.findFirst({
    where: {
      agentId,
      organizationId
    }
  });
  if (!agent ) return null;

  const prismaConfigData = toPrismaConfigData(data);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.agentConfiguration.findUnique({
      where: { agentId },
      select: { agentConfigId: true },
    });

    if (existing) {
      // Update path — do NOT touch isConfigured (already true from first create).
      return tx.agentConfiguration.update({
        where: { agentId },
        data: prismaConfigData,
      });
    }

    // Create path — write the config and flip the agent flag atomically.
    const [configuration] = await Promise.all([
      tx.agentConfiguration.create({
        data: {
          agentId,
          ...agentConfigCreateDefaults,
          ...prismaConfigData,
        },
      }),
      tx.agent.update({
        where: { agentId },
        data: { isConfigured: true },
      }),
    ]);

    return configuration;
  });
};

export const getAgentConfig = async (
  organizationId: string,
  agentId: string
) => {
  // Filter through the agent relation so a config row owned by another
  // org cannot be returned even if the caller guesses a valid agentId.
  return prisma.agentConfiguration.findFirst({
    where: {
      agentId,
      agent: { organizationId },
    },
  });
};

// Cross-entity foreign-key check used by linkAgent to verify the target agent
// lives in the same org as the number being linked. Kept here rather than in
// agent.repository.ts so the numbers module does not reach across module
// boundaries at the service layer.
export const agentExistsInOrg = async (
  agentId: string,
  organizationId: string
) => {
  const row = await prisma.agent.findFirst({
    where: { agentId, organizationId },
    select: { agentId: true },
  });
  return row !== null;
};

export const getAgentConfigByNumber= async (
  phoneNumber:string
)=>{
  const phone = await prisma.phoneNumber.findUnique({
    where: {
      number: phoneNumber,
    },
    select: {
      number: true,
      organizationId: true,
      userId: true,
      provider: true,
      agent: {
        select: {
          userId: true,
          configuration: true,
          tools: true,
          mcpConnections: {
            where: { enabled: true },
            include: {
              mcpConnection: true,
            },
          },
        },
      },
    },
  });
  
  if (!phone?.agent?.configuration) return null;

  return {
    ...phone.agent.configuration,
    organizationId: phone.organizationId,
    userId: phone.userId ?? phone.agent.userId,
    agentNumber: phone.number,
    provider: phone.provider,
    tools: phone.agent.tools,
    mcpConnections: phone.agent.mcpConnections.map((item) => item.mcpConnection),
  };
}

export const getAgentConfigByIdForRuntime = async (agentId: string) => {
  const agent = await prisma.agent.findUnique({
    where: { agentId },
    select: {
      organizationId: true,
      userId: true,
      configuration: true,
      phoneNumbers: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          number: true,
          provider: true,
          userId: true,
        },
      },
      tools: true,
      mcpConnections: {
        where: { enabled: true },
        include: {
          mcpConnection: true,
        },
      },
    },
  });

  if (!agent?.configuration) return null;

  const phone = agent.phoneNumbers[0] ?? null;

  return {
    ...agent.configuration,
    organizationId: agent.organizationId,
    userId: phone?.userId ?? agent.userId,
    agentNumber: phone?.number ?? null,
    provider: phone?.provider ?? null,
    tools: agent.tools,
    mcpConnections: agent.mcpConnections.map((item) => item.mcpConnection),
  };
};
