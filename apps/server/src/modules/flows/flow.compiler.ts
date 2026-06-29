import type { AgentFlowGraph, FlowGraphEdge, FlowGraphNode } from "./flow.schema.js";

export interface CompiledAgentConfig {
  agentId: string;
  name: string;
  firstMessage: string;
  systemPrompt: string;
  llmModel: string;
  sttModel: string;
  ttsModel: string;
  voiceId: string;
  use_rag: boolean;
  tools: unknown[];
  mcpConnections: unknown[];
}

export interface CompiledAgentFlow {
  version: 1;
  flowId: string;
  rootAgentId: string;
  startNodeId: string;
  nodesById: Record<string, FlowGraphNode>;
  outgoingByNodeId: Record<string, FlowGraphEdge[]>;
  agentsByNodeId: Record<string, CompiledAgentConfig>;
}

export function compileFlowGraph(args: {
  flowId: string;
  rootAgentId: string;
  graph: AgentFlowGraph;
  agentConfigs: Record<string, CompiledAgentConfig>;
}): CompiledAgentFlow {
  const start = args.graph.nodes.find((node) => node.type === "start");
  if (!start) throw new Error("Flow must contain a start node");
  if (start.data.agentId !== args.rootAgentId) {
    throw new Error("Start node agent must match root agent");
  }

  const nodesById = Object.fromEntries(
    args.graph.nodes.map((node) => [node.id, node])
  );
  const outgoingByNodeId: Record<string, FlowGraphEdge[]> = {};

  for (const node of args.graph.nodes) {
    outgoingByNodeId[node.id] = [];
  }

  for (const edge of args.graph.edges) {
    outgoingByNodeId[edge.source]?.push(edge);
  }

  for (const edges of Object.values(outgoingByNodeId)) {
    edges.sort((a, b) => a.data.priority - b.data.priority);
  }

  const agentsByNodeId: CompiledAgentFlow["agentsByNodeId"] = {};
  for (const node of args.graph.nodes) {
    if (!node.data.agentId) continue;
    const config = args.agentConfigs[node.data.agentId];
    if (!config) {
      throw new Error(`Missing configuration for agent ${node.data.agentId}`);
    }
    agentsByNodeId[node.id] = config;
  }

  return {
    version: 1,
    flowId: args.flowId,
    rootAgentId: args.rootAgentId,
    startNodeId: start.id,
    nodesById,
    outgoingByNodeId,
    agentsByNodeId,
  };
}
