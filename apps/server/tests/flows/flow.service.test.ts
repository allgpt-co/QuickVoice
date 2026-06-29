import assert from "node:assert/strict";
import { test } from "node:test";

import { createFlow, createFlowTestRun, updateFlow, type FlowServiceRepository } from "../../src/modules/flows/flow.service.js";

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
  tools: [],
  mcpConnections: [],
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

function makeCompiledFlow() {
  return {
    version: 1,
    flowId: "flow-2",
    rootAgentId,
    startNodeId: "start",
    nodesById: {
      start: { id: "start", type: "start", data: { label: "General", agentId: rootAgentId } },
      returns: { id: "returns", type: "agent", data: { label: "Returns", agentId: specialistAgentId } },
    },
    outgoingByNodeId: {
      start: [
        {
          id: "returns-route",
          source: "start",
          target: "returns",
          type: "llm_condition",
          data: { label: "Returns", condition: "Customer wants to return an order", priority: 10 },
        },
      ],
    },
    agentsByNodeId: {},
  };
}

function makeFlowRecord(compiledJson: unknown = makeCompiledFlow()) {
  return {
    flowId: "flow-2",
    organizationId: orgId,
    userId,
    rootAgentId,
    name: "Support flow",
    description: null,
    graphJson: baseGraph,
    compiledJson,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
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

test("createFlowTestRun proxies compiled flow to AI simulator", async () => {
  const compiledJson = {
    version: 1,
    flowId: "flow-2",
    rootAgentId,
    startNodeId: "start",
    nodesById: {
      start: { id: "start", type: "start", data: { label: "General", agentId: rootAgentId } },
      returns: { id: "returns", type: "agent", data: { label: "Returns", agentId: specialistAgentId } },
    },
    outgoingByNodeId: {
      start: [
        {
          id: "returns-route",
          source: "start",
          target: "returns",
          type: "llm_condition",
          data: { label: "Returns", condition: "Customer wants to return an order", priority: 10 },
        },
      ],
    },
    agentsByNodeId: {},
  };
  const repository = makeRepository({
    findFlowForOrg: async () => ({
      flowId: "flow-2",
      organizationId: orgId,
      userId,
      rootAgentId,
      name: "Support flow",
      description: null,
      graphJson: baseGraph,
      compiledJson,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  });
  const aiCalls: unknown[] = [];

  const result = await createFlowTestRun(
    orgId,
    "flow-2",
    { messages: [{ role: "user", content: "I need to return my order" }] },
    {
      repository,
      runtimeConfigLoader: async (agentId) => ({
        agentId,
        organizationId: orgId,
        systemPrompt: "Runtime root prompt",
      }),
      aiClient: async (payload) => {
        aiCalls.push(payload);
        return {
          success: true,
          path: [{ nodeId: "start" }, { nodeId: "returns" }],
          selectedRoutes: [{ routeId: "returns-route" }],
          warnings: [],
        };
      },
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.path, [{ nodeId: "start" }, { nodeId: "returns" }]);
  assert.equal(aiCalls.length, 1);
  const payload = aiCalls[0] as { config: { flow: { flowId: string; compiled: unknown } }; messages: unknown[] };
  assert.equal(payload.config.flow.flowId, "flow-2");
  assert.equal(payload.config.flow.compiled, compiledJson);
  assert.deepEqual(payload.messages, [{ role: "user", content: "I need to return my order" }]);
});



test("createFlowTestRun rejects uncompiled flows before loading runtime config", async () => {
  const repository = makeRepository({
    findFlowForOrg: async () => makeFlowRecord(null),
  });
  let runtimeLoaded = false;

  await assert.rejects(
    createFlowTestRun(
      orgId,
      "flow-2",
      { messages: [{ role: "user", content: "Hello" }] },
      {
        repository,
        runtimeConfigLoader: async () => {
          runtimeLoaded = true;
          return { agentId: rootAgentId };
        },
        aiClient: async () => ({ success: true, path: [], selectedRoutes: [], warnings: [] }),
      }
    ),
    /compiled/
  );

  assert.equal(runtimeLoaded, false);
});

test("createFlowTestRun rejects missing root runtime config", async () => {
  const repository = makeRepository({
    findFlowForOrg: async () => makeFlowRecord(),
  });

  await assert.rejects(
    createFlowTestRun(
      orgId,
      "flow-2",
      { messages: [{ role: "user", content: "Hello" }] },
      {
        repository,
        runtimeConfigLoader: async () => null,
        aiClient: async () => ({ success: true, path: [], selectedRoutes: [], warnings: [] }),
      }
    ),
    /Root agent runtime config/
  );
});

test("createFlowTestRun posts to AI simulator with internal key", async () => {
  const repository = makeRepository({
    findFlowForOrg: async () => makeFlowRecord(),
  });
  const originalFetch = globalThis.fetch;
  const originalAiApiUrl = process.env.AI_API_URL;
  const originalInternalApiKey = process.env.INTERNAL_API_KEY;
  let captured: { url: Parameters<typeof fetch>[0]; init: Parameters<typeof fetch>[1] } | null = null;

  globalThis.fetch = (async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ success: true, path: [{ nodeId: "start" }], selectedRoutes: [], warnings: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  process.env.AI_API_URL = "http://ai.local/";
  process.env.INTERNAL_API_KEY = "internal-secret";

  try {
    const result = await createFlowTestRun(
      orgId,
      "flow-2",
      { messages: [{ role: "user", content: "Hello" }] },
      {
        repository,
        runtimeConfigLoader: async () => ({ agentId: rootAgentId, organizationId: orgId }),
      }
    );

    assert.equal(result.success, true);
    assert.ok(captured);
    assert.equal(String(captured.url), "http://ai.local/flows/simulate");
    const init = captured.init as RequestInit;
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["x-internal-key"], "internal-secret");
    const body = JSON.parse(String(init.body)) as { config: { flow: { compiled: unknown } }; messages: unknown[] };
    assert.deepEqual(body.config.flow.compiled, makeFlowRecord().compiledJson);
    assert.deepEqual(body.messages, [{ role: "user", content: "Hello" }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAiApiUrl === undefined) delete process.env.AI_API_URL;
    else process.env.AI_API_URL = originalAiApiUrl;
    if (originalInternalApiKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = originalInternalApiKey;
  }
});

test("createFlowTestRun surfaces non-OK AI simulator responses", async () => {
  const repository = makeRepository({
    findFlowForOrg: async () => makeFlowRecord(),
  });
  const originalFetch = globalThis.fetch;
  const originalInternalApiKey = process.env.INTERNAL_API_KEY;

  globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
  process.env.INTERNAL_API_KEY = "internal-secret";

  try {
    await assert.rejects(
      createFlowTestRun(
        orgId,
        "flow-2",
        { messages: [{ role: "user", content: "Hello" }] },
        {
          repository,
          runtimeConfigLoader: async () => ({ agentId: rootAgentId, organizationId: orgId }),
        }
      ),
      /Flow simulation failed \(503\): unavailable/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInternalApiKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = originalInternalApiKey;
  }
});
