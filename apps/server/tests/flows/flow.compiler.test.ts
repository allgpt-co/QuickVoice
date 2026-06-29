import test from "node:test";
import assert from "node:assert/strict";

import {
  compileFlowGraph,
  type CompiledAgentConfig,
} from "../../src/modules/flows/flow.compiler.js";

const rootAgentId = "00000000-0000-0000-0000-000000000001";
const returnsAgentId = "00000000-0000-0000-0000-000000000002";

const agentConfig = (agentId: string, name: string): CompiledAgentConfig => ({
  agentId,
  name,
  firstMessage: "Hello from " + name,
  systemPrompt: name + " system prompt",
  llmModel: "gpt-4o-mini",
  sttModel: "nova-3",
  ttsModel: "aura-2",
  voiceId: "voice-1",
  use_rag: false,
  tools: [{ toolId: agentId + "-tool" }],
  mcpConnections: [{ mcpConnectionId: agentId + "-mcp" }],
});

test("compileFlowGraph sorts outgoing edges by priority", () => {
  const compiled = compileFlowGraph({
    flowId: "flow-1",
    rootAgentId,
    graph: {
      version: 1,
      nodes: [
        {
          id: "start",
          type: "start",
          position: { x: 0, y: 0 },
          data: { label: "General", agentId: rootAgentId },
        },
        {
          id: "returns",
          type: "agent",
          position: { x: 300, y: 0 },
          data: { label: "Returns", agentId: returnsAgentId },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "start",
          target: "returns",
          type: "default",
          data: { label: "Fallback", priority: 99 },
        },
        {
          id: "e2",
          source: "start",
          target: "returns",
          type: "llm_condition",
          data: {
            label: "Returns",
            condition: "Customer asks about returns",
            priority: 10,
          },
        },
      ],
    },
    agentConfigs: {
      [rootAgentId]: agentConfig(rootAgentId, "General"),
      [returnsAgentId]: agentConfig(returnsAgentId, "Returns"),
    },
  });

  assert.equal(compiled.startNodeId, "start");
  assert.deepEqual(
    compiled.outgoingByNodeId.start.map((edge) => edge.id),
    ["e2", "e1"]
  );
  assert.deepEqual(compiled.agentsByNodeId.returns.tools, [
    { toolId: returnsAgentId + "-tool" },
  ]);
  assert.deepEqual(compiled.agentsByNodeId.returns.mcpConnections, [
    { mcpConnectionId: returnsAgentId + "-mcp" },
  ]);
});
