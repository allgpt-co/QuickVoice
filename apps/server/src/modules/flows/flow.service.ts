import { randomUUID } from "node:crypto";

import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import * as agentService from "../agent/agent.service.js";
import {
  compileFlowGraph,
  type CompiledAgentConfig,
  type CompiledAgentFlow,
} from "./flow.compiler.js";
import * as flowRepository from "./flow.repository.js";
import {
  flowGraphSchema,
  type AgentFlowGraph,
  type CreateFlowInput,
  type FlowTestRunInput,
  type UpdateFlowInput,
} from "./flow.schema.js";

export interface FlowRecord {
  flowId: string;
  organizationId: string;
  userId: string | null;
  rootAgentId: string;
  name: string;
  description: string | null;
  graphJson: unknown;
  compiledJson: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowServiceRepository {
  listFlows: typeof flowRepository.listFlows;
  findFlowForOrg: (
    organizationId: string,
    flowId: string
  ) => Promise<FlowRecord | null>;
  findAgentsForOrg: typeof flowRepository.findAgentsForOrg;
  createFlow: (
    input: flowRepository.CreateFlowRepositoryInput
  ) => Promise<FlowRecord>;
  updateFlow: (
    organizationId: string,
    flowId: string,
    input: flowRepository.UpdateFlowRepositoryInput
  ) => Promise<FlowRecord | null>;
  deleteFlow: (
    organizationId: string,
    flowId: string
  ) => Promise<{ count: number }>;
}

export type FlowTestRunResult = {
  success: boolean;
  path: unknown[];
  selectedRoutes: unknown[];
  warnings: string[];
};

type FlowSimulationPayload = {
  config: Record<string, unknown>;
  messages: FlowTestRunInput["messages"];
};

type FlowAiClient = (payload: FlowSimulationPayload) => Promise<FlowTestRunResult>;
type RuntimeConfigLoader = (agentId: string) => Promise<Record<string, unknown> | null>;

type FlowServiceDeps = {
  repository?: FlowServiceRepository;
  runtimeConfigLoader?: RuntimeConfigLoader;
  aiClient?: FlowAiClient;
};

type CreateFlowArgs = CreateFlowInput & {
  organizationId: string;
  userId: string;
};

const defaultRepository: FlowServiceRepository = flowRepository;
const defaultRuntimeConfigLoader: RuntimeConfigLoader = (agentId) =>
  agentService.getAgentConfigByIdForRuntime(agentId) as Promise<Record<string, unknown> | null>;

const defaultAiClient: FlowAiClient = async (payload) => {
  const rawAiApiUrl = process.env.AI_API_URL ?? "http://localhost:5555";
  const aiApiUrl = rawAiApiUrl.endsWith("/") ? rawAiApiUrl.slice(0, -1) : rawAiApiUrl;
  const internalApiKey = process.env.INTERNAL_API_KEY ?? "";
  if (!internalApiKey) {
    throw new BadRequestError("INTERNAL_API_KEY is required to run flow simulations");
  }

  const response = await fetch(aiApiUrl + "/flows/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new BadRequestError("Flow simulation failed (" + response.status + "): " + body);
  }

  return (await response.json()) as FlowTestRunResult;
};

export const listFlows = (
  organizationId: string,
  rootAgentId?: string,
  deps: FlowServiceDeps = {}
) => {
  const repository = deps.repository ?? defaultRepository;
  return repository.listFlows(organizationId, rootAgentId);
};

export const getFlow = async (
  organizationId: string,
  flowId: string,
  deps: FlowServiceDeps = {}
) => {
  const repository = deps.repository ?? defaultRepository;
  const flow = await repository.findFlowForOrg(organizationId, flowId);
  if (!flow) throw new NotFoundError("Flow not found");
  return flow;
};

export const createFlow = async (
  args: CreateFlowArgs,
  deps: FlowServiceDeps = {}
) => {
  const repository = deps.repository ?? defaultRepository;
  const graph = flowGraphSchema.parse(args.graphJson);
  const flowId = randomUUID();
  const compiledJson = await validateAndCompileFlow({
    flowId,
    repository,
    organizationId: args.organizationId,
    rootAgentId: args.rootAgentId,
    graph,
    isActive: args.isActive,
  });

  return repository.createFlow({
    flowId,
    organizationId: args.organizationId,
    userId: args.userId,
    rootAgentId: args.rootAgentId,
    name: args.name,
    description: args.description,
    graphJson: graph,
    compiledJson,
    isActive: args.isActive,
  });
};

export const updateFlow = async (
  organizationId: string,
  flowId: string,
  input: UpdateFlowInput,
  deps: FlowServiceDeps = {}
) => {
  const repository = deps.repository ?? defaultRepository;
  const existing = await repository.findFlowForOrg(organizationId, flowId);
  if (!existing) throw new NotFoundError("Flow not found");

  const rootAgentId = input.rootAgentId ?? existing.rootAgentId;
  const graph = input.graphJson
    ? flowGraphSchema.parse(input.graphJson)
    : flowGraphSchema.parse(existing.graphJson);
  const isActive = input.isActive ?? existing.isActive;
  const compiledJson = await validateAndCompileFlow({
    flowId: existing.flowId,
    repository,
    organizationId,
    rootAgentId,
    graph,
    isActive,
  });

  const updated = await repository.updateFlow(organizationId, flowId, {
    ...input,
    rootAgentId,
    graphJson: graph,
    compiledJson,
    isActive,
  });

  if (!updated) throw new NotFoundError("Flow not found");
  return updated;
};

export const deleteFlow = async (
  organizationId: string,
  flowId: string,
  deps: FlowServiceDeps = {}
) => {
  const repository = deps.repository ?? defaultRepository;
  const result = await repository.deleteFlow(organizationId, flowId);
  if (result.count === 0) throw new NotFoundError("Flow not found");
};

export const createFlowTestRun = async (
  organizationId: string,
  flowId: string,
  input: FlowTestRunInput,
  deps: FlowServiceDeps = {}
) => {
  const repository = deps.repository ?? defaultRepository;
  const runtimeConfigLoader = deps.runtimeConfigLoader ?? defaultRuntimeConfigLoader;
  const aiClient = deps.aiClient ?? defaultAiClient;
  const flow = await getFlow(organizationId, flowId, { repository });

  if (!flow.compiledJson) {
    throw new BadRequestError("Flow must be compiled before running a test");
  }

  const runtimeConfig = await runtimeConfigLoader(flow.rootAgentId);
  if (!runtimeConfig) {
    throw new NotFoundError("Root agent runtime config not found");
  }

  return aiClient({
    config: {
      ...runtimeConfig,
      flow: {
        flowId: flow.flowId,
        rootAgentId: flow.rootAgentId,
        name: flow.name,
        graph: flow.graphJson,
        compiled: flow.compiledJson,
      },
    },
    messages: input.messages,
  });
};

async function validateAndCompileFlow(args: {
  flowId: string;
  repository: FlowServiceRepository;
  organizationId: string;
  rootAgentId: string;
  graph: AgentFlowGraph;
  isActive: boolean;
}): Promise<CompiledAgentFlow | null> {
  const start = args.graph.nodes.find((node) => node.type === "start");
  if (!start) throw new BadRequestError("Flow must contain a start node");
  if (start.data.agentId !== args.rootAgentId) {
    throw new BadRequestError("Start node agent must match root agent");
  }

  const agentIds = Array.from(
    new Set(
      args.graph.nodes
        .map((node) => node.data.agentId)
        .filter((agentId): agentId is string => Boolean(agentId))
    )
  );
  const agents = await args.repository.findAgentsForOrg(
    args.organizationId,
    agentIds
  );
  const agentsById = new Map(agents.map((agent) => [agent.agentId, agent]));
  const missingAgentIds = agentIds.filter((agentId) => !agentsById.has(agentId));

  if (missingAgentIds.includes(args.rootAgentId)) {
    throw new NotFoundError("Root agent not found");
  }
  if (missingAgentIds.length > 0) {
    throw new BadRequestError("All flow agents must belong to this organization");
  }

  const unconfiguredAgents = agents.filter(
    (agent) => !agent.isConfigured || !agent.configuration
  );
  if (args.isActive && unconfiguredAgents.length > 0) {
    throw new BadRequestError(
      "All flow agents must be configured before activation"
    );
  }

  if (unconfiguredAgents.length > 0) return null;

  const agentConfigs: Record<string, CompiledAgentConfig> = {};
  for (const agent of agents) {
    if (!agent.configuration) continue;
    agentConfigs[agent.agentId] = agent.configuration;
  }

  return compileFlowGraph({
    flowId: args.flowId,
    rootAgentId: args.rootAgentId,
    graph: args.graph,
    agentConfigs,
  });
}
