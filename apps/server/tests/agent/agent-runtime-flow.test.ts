import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAgentConfigByIdForRuntime,
  getAgentConfigByNumber,
} from "../../src/modules/agent/agent.repository.js";

const rootAgentId = "11111111-1111-4111-8111-111111111111";
const flowId = "44444444-4444-4444-8444-444444444444";

const configuration = {
  agentConfigId: "config-1",
  agentId: rootAgentId,
  systemPrompt: "General prompt",
  firstMessage: "Hello",
};

const compiledFlow = {
  version: 1,
  flowId,
  rootAgentId,
  startNodeId: "start",
  nodesById: {},
  outgoingByNodeId: {},
  agentsByNodeId: {},
};

const graphJson = {
  version: 1,
  nodes: [],
  edges: [],
};

test("getAgentConfigByNumber includes active flow for root agent", async () => {
  const client = {
    phoneNumber: {
      findUnique: async () => ({
        number: "+15551230000",
        organizationId: "org_123",
        userId: "user_123",
        provider: "TWILIO",
        agent: {
          agentId: rootAgentId,
          userId: "agent_user_123",
          configuration,
          tools: [],
          mcpConnections: [],
        },
      }),
    },
    agentFlow: {
      findFirst: async (args: any) => {
        assert.deepEqual(args.where, {
          organizationId: "org_123",
          rootAgentId,
          isActive: true,
        });
        return {
          flowId,
          rootAgentId,
          name: "Support flow",
          graphJson,
          compiledJson: compiledFlow,
        };
      },
    },
  };

  const config = await getAgentConfigByNumber("+15551230000", client as any);

  assert.equal(config?.flow.flowId, flowId);
  assert.equal(config?.flow.rootAgentId, rootAgentId);
  assert.equal(config?.flow.compiled.version, 1);
});

test("getAgentConfigByIdForRuntime includes active flow for requested root agent", async () => {
  const client = {
    agent: {
      findUnique: async () => ({
        organizationId: "org_123",
        userId: "agent_user_123",
        configuration,
        phoneNumbers: [],
        tools: [],
        mcpConnections: [],
      }),
    },
    agentFlow: {
      findFirst: async (args: any) => {
        assert.deepEqual(args.where, {
          organizationId: "org_123",
          rootAgentId,
          isActive: true,
        });
        return {
          flowId,
          rootAgentId,
          name: "Support flow",
          graphJson,
          compiledJson: compiledFlow,
        };
      },
    },
  };

  const config = await getAgentConfigByIdForRuntime(rootAgentId, client as any);

  assert.equal(config?.flow.flowId, flowId);
  assert.equal(config?.flow.rootAgentId, rootAgentId);
  assert.equal(config?.flow.compiled.version, 1);
});

test("runtime config omits inactive flows", async () => {
  const client = {
    agent: {
      findUnique: async () => ({
        organizationId: "org_123",
        userId: "agent_user_123",
        configuration,
        phoneNumbers: [],
        tools: [],
        mcpConnections: [],
      }),
    },
    agentFlow: {
      findFirst: async () => null,
    },
  };

  const config = await getAgentConfigByIdForRuntime(rootAgentId, client as any);

  assert.equal(config?.flow, null);
});
