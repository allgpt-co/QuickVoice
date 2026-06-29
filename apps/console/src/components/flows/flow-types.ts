import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type {
  AgentFlowGraph,
  AgentFlowGraphEdge,
  AgentFlowGraphNode,
  FlowEdgeType,
  FlowNodeType,
} from "@/src/lib/api/types";

export const FLOW_NODE_WIDTH = 256;
export const FLOW_NODE_HEIGHT = 96;

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  nodeType: FlowNodeType;
  agentId?: string;
  transferMessage?: string;
  enableFirstMessage?: boolean;
}

export interface FlowEdgeData extends Record<string, unknown> {
  label: string;
  edgeType: FlowEdgeType;
  condition?: string;
  priority: number;
}

export type FlowBuilderNode = Node<FlowNodeData, FlowNodeType>;
export type FlowBuilderEdge = Edge<FlowEdgeData>;

export function createDefaultFlowGraph(rootAgentId: string): AgentFlowGraph {
  return {
    version: 1,
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 0, y: 80 },
        data: { label: "General", agentId: rootAgentId },
      },
      {
        id: "end",
        type: "end",
        position: { x: 420, y: 80 },
        data: { label: "End call" },
      },
    ],
    edges: [
      {
        id: "start-end-default",
        source: "start",
        target: "end",
        type: "default",
        data: { label: "Fallback", priority: 0 },
      },
    ],
  };
}

export function graphToFlowElements(graph: AgentFlowGraph): {
  nodes: FlowBuilderNode[];
  edges: FlowBuilderEdge[];
} {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        ...node.data,
        label: node.data.label,
        nodeType: node.type,
      },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.data.label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      data: {
        label: edge.data.label,
        edgeType: edge.type,
        condition: edge.data.condition,
        priority: edge.data.priority,
      },
      className: edge.type === "default" ? "stroke-muted-foreground" : undefined,
    })),
  };
}

export function flowElementsToGraph(
  nodes: FlowBuilderNode[],
  edges: FlowBuilderEdge[]
): AgentFlowGraph {
  return {
    version: 1,
    nodes: nodes.map((node): AgentFlowGraphNode => ({
      id: node.id,
      type: node.data.nodeType,
      position: node.position,
      data: {
        label: node.data.label,
        agentId: node.data.agentId,
        transferMessage: node.data.transferMessage,
        enableFirstMessage: node.data.enableFirstMessage,
      },
    })),
    edges: edges.map((edge): AgentFlowGraphEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.data?.edgeType ?? "llm_condition",
      data: {
        label: edge.data?.label ?? String(edge.label ?? "Route"),
        condition: edge.data?.condition,
        priority: edge.data?.priority ?? 0,
      },
    })),
  };
}

export function createFlowNode(type: FlowNodeType, index: number): FlowBuilderNode {
  const id = `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const label = type === "agent" ? "Specialist" : type === "end" ? "End call" : "General";

  return {
    id,
    type,
    position: { x: 220 + index * 80, y: 120 + index * 24 },
    data: { label, nodeType: type },
  };
}

export function createFlowEdge(
  source: string,
  target: string,
  priority: number
): FlowBuilderEdge {
  return {
    id: `edge-${source}-${target}-${Date.now()}`,
    source,
    target,
    label: "Route",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    data: {
      label: "Route",
      edgeType: "llm_condition",
      condition: "Customer intent matches this route",
      priority,
    },
  };
}
