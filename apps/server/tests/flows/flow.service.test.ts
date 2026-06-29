import assert from "node:assert/strict";
import { test } from "node:test";

import { createFlow, updateFlow, type FlowServiceRepository } from "../../src/modules/flows/flow.service.js";

const orgId = "org_123";
const userId = "user_123";
const rootAgentId = "11111111-1111-4111-8111-111111111111";
const specialistAgentId = "22222222-2222-4222-8222-222222222222";
const otherOrgAgentId = "33333333-3333-4333-8333-333333333333";

const agentConfig = {
  firstMessage: "Hello",
  systemPrompt: "You are helpful.",
  llmModel: "gpt-4o-mini",
  sttModel: "nova-3",
  ttsModel: "aura-2",
  voiceId: "voice-1",
  use_rag: false,
};

const baseGraph = {
  version: 1 as const,
  nodes: [
    {
      id: "start",
      type: "start" as const,
      position: { x: 0, y: 0 },
      data: { label: "General", agentId: rootAgentId },
    },
    {
      id: "returns",
      type: "agent" as const,
      position: { x: 300, y: 0 },
      data: { label: "Returns", agentId: specialistAgentId },
    },
  ],
  edges: [
    {
      id: "returns-route",
      source: "start",
      target: "returns",
      type: "llm_condition" as const,
      data: {
        label: "Returns",
        condition: "Customer asks about returns",
        priority: 10,
      },
    },
  ],
};

function configuredAgent(agentId: string, name = "Agent") {
  return {
    agentId,
    name,
    isConfigured: true,
    configuration: agentConfig,
  };
}

function makeRepository(overrides: Partial<FlowServiceRepository> = {}) {
  const repository: FlowServiceRepository = {
    listFlows: async () => [],
    findFlowForOrg: async () => null,
    findAgentsForOrg: async (_organizationId, agentIds) =>
      agentIds.map((agentId) => configuredAgent(agentId)),
    createFlow: async (input) => ({
      flowId: "flow-1",
      organizationId: input.organizationId,
      userId: input.userId,
      rootAgentId: input.rootAgentId,
      name: input.name,
      description: input.description ?? null,
      graphJson: input.graphJson,
      compiledJson: input.compiledJson,
      isActive: input.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    updateFlow: async (organizationId, flowId, input) => ({
      flowId,
      organizationId,
      userId,
      rootAgentId: input.rootAgentId ?? rootAgentId,
      name: input.name ?? "Flow",
      description: input.description ?? null,
      graphJson: input.graphJson ?? baseGraph,
      compiledJson: input.compiledJson,
      isActive: input.isActive ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    deleteFlow: async () => ({ count: 1 }),
    ...overrides,
  };
  return repository;
}

test("createFlow rejects agent IDs from another organization", async () => {
  const graph = {
    ...baseGraph,
    nodes: [
      baseGraph.nodes[0],
      {
        ...baseGraph.nodes[1],
        data: { ...baseGraph.nodes[1].data, agentId: otherOrgAgentId },
      },
    ],
  };
  const repository = makeRepository({
    findAgentsForOrg: async () => [configuredAgent(rootAgentId, "General")],
  });

  await assert.rejects(
    createFlow(
      {
        organizationId: orgId,
        userId,
        rootAgentId,
        name: "Support flow",
        graphJson: graph,
        isActive: false,
      },
      { repository }
    ),
    /belong to this organization/
  );
});

test("createFlow rejects activation when a target agent is not configured", async () => {
  const repository = makeRepository({
    findAgentsForOrg: async () => [
      configuredAgent(rootAgentId, "General"),
      {
        agentId: specialistAgentId,
        name: "Returns",
        isConfigured: false,
        configuration: null,
      },
    ],
  });

  await assert.rejects(
    createFlow(
      {
        organizationId: orgId,
        userId,
        rootAgentId,
        name: "Support flow",
        graphJson: baseGraph,
        isActive: true,
      },
      { repository }
    ),
    /configured before activation/
  );
});

test("createFlow deactivates prior active flow for same root agent", async () => {
  const flows = [
    { flowId: "flow-old", rootAgentId, isActive: true },
  ];
  const repository = makeRepository({
    createFlow: async (input) => {
      if (input.isActive) {
        for (const flow of flows) {
          if (flow.rootAgentId === input.rootAgentId) flow.isActive = false;
        }
      }
      flows.push({ flowId: "flow-new", rootAgentId: input.rootAgentId, isActive: input.isActive });
      return {
        flowId: "flow-new",
        organizationId: input.organizationId,
        userId: input.userId,
        rootAgentId: input.rootAgentId,
        name: input.name,
        description: input.description ?? null,
        graphJson: input.graphJson,
        compiledJson: input.compiledJson,
        isActive: input.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  });

  const created = await createFlow(
    {
      organizationId: orgId,
      userId,
      rootAgentId,
      name: "Support flow",
      graphJson: baseGraph,
      isActive: true,
    },
    { repository }
  );

  assert.equal(created.isActive, true);
  assert.equal(flows.find((flow) => flow.flowId === "flow-old")?.isActive, false);
});

test("createFlow allows draft flow with incomplete specialist config", async () => {
  const repository = makeRepository({
    findAgentsForOrg: async () => [
      configuredAgent(rootAgentId, "General"),
      {
        agentId: specialistAgentId,
        name: "Returns",
        isConfigured: false,
        configuration: null,
      },
    ],
  });

  const created = await createFlow(
    {
      organizationId: orgId,
      userId,
      rootAgentId,
      name: "Draft support flow",
      graphJson: baseGraph,
      isActive: false,
    },
    { repository }
  );

  assert.equal(created.isActive, false);
  assert.equal(created.compiledJson, null);
});

test("updateFlow deactivates prior active flow for same root agent", async () => {
  const calls: unknown[] = [];
  const repository = makeRepository({
    findFlowForOrg: async () => ({
      flowId: "flow-2",
      organizationId: orgId,
      userId,
      rootAgentId,
      name: "Support flow",
      description: null,
      graphJson: baseGraph,
      compiledJson: null,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    updateFlow: async (_organizationId, flowId, input) => {
      calls.push(["update", flowId, input.isActive, input.rootAgentId]);
      return {
        flowId,
        organizationId: orgId,
        userId,
        rootAgentId: input.rootAgentId ?? rootAgentId,
        name: "Support flow",
        description: null,
        graphJson: input.graphJson ?? baseGraph,
        compiledJson: input.compiledJson,
        isActive: input.isActive ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  });

  await updateFlow(orgId, "flow-2", { isActive: true }, { repository });

  assert.deepEqual(calls[0], ["update", "flow-2", true, rootAgentId]);
});
