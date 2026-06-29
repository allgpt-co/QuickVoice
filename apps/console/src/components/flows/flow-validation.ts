import type { Agent } from "@/src/lib/api/types";

import type { FlowBuilderEdge, FlowBuilderNode } from "./flow-types";

export interface FlowValidationIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
}

interface ValidateFlowArgs {
  nodes: FlowBuilderNode[];
  edges: FlowBuilderEdge[];
  rootAgentId: string;
  agents: Agent[];
}

export function validateFlow({
  nodes,
  edges,
  rootAgentId,
  agents,
}: ValidateFlowArgs): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const agentIds = new Set(agents.map((agent) => agent.agentId));
  const startNodes = nodes.filter((node) => node.data.nodeType === "start");

  if (startNodes.length !== 1) {
    issues.push({ level: "error", message: "Flow must contain exactly one start node" });
  }

  for (const startNode of startNodes) {
    if (startNode.data.agentId !== rootAgentId) {
      issues.push({
        level: "error",
        message: "Start node agent must match the root agent",
        nodeId: startNode.id,
      });
    }
  }

  if (startNodes.length === 1) {
    const reachable = new Set<string>();
    const queue = [startNodes[0].id];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      for (const edge of edges) {
        if (edge.source === nodeId && !reachable.has(edge.target)) queue.push(edge.target);
      }
    }

    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        issues.push({ level: "error", message: "Node is not reachable from the start node", nodeId: node.id });
      }
    }
  }

  for (const node of nodes) {
    const outgoing = edges.filter((edge) => edge.source === node.id);
    const label = node.data.label.trim();

    if (label.length < 1 || label.length > 120) {
      issues.push({ level: "error", message: "Node label must be 1 to 120 characters", nodeId: node.id });
    }

    if ((node.data.transferMessage?.length ?? 0) > 500) {
      issues.push({ level: "error", message: "Transfer message must be 500 characters or fewer", nodeId: node.id });
    }

    if (node.data.nodeType === "agent" && !node.data.agentId) {
      issues.push({ level: "error", message: "Agent node requires an agent", nodeId: node.id });
    }

    if (
      (node.data.nodeType === "start" || node.data.nodeType === "agent") &&
      node.data.agentId &&
      !agentIds.has(node.data.agentId)
    ) {
      issues.push({
        level: "warning",
        message: "Selected agent is not available in this organization",
        nodeId: node.id,
      });
    }

    if (node.data.nodeType !== "end" && outgoing.length === 0) {
      issues.push({
        level: "error",
        message: "Non-terminal nodes need at least one outgoing route",
        nodeId: node.id,
      });
    }

    if (node.data.nodeType === "end" && outgoing.length > 0) {
      issues.push({ level: "error", message: "End nodes cannot have outgoing routes", nodeId: node.id });
    }

    if (outgoing.filter((edge) => edge.data?.edgeType === "default").length > 1) {
      issues.push({ level: "warning", message: "Only one default route should leave a node", nodeId: node.id });
    }
  }

  for (const edge of edges) {
    const target = nodes.find((node) => node.id === edge.target);
    const label = edge.data?.label?.trim() ?? "";
    const priority = edge.data?.priority ?? 0;

    if (label.length < 1 || label.length > 120) {
      issues.push({ level: "error", message: "Route label must be 1 to 120 characters", edgeId: edge.id });
    }

    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
      issues.push({ level: "error", message: "Route priority must be between 0 and 1000", edgeId: edge.id });
    }

    if (target?.data.nodeType === "start") {
      issues.push({ level: "error", message: "Routes cannot point into the start node", edgeId: edge.id });
    }

    if (edge.data?.edgeType === "llm_condition") {
      const condition = edge.data.condition?.trim() ?? "";
      if (condition.length < 5 || condition.length > 1000) {
        issues.push({
          level: "error",
          message: "LLM condition route requires 5 to 1000 characters of condition text",
          edgeId: edge.id,
        });
      }
    }
  }

  if (nodes.length > 50) {
    issues.push({ level: "error", message: "Flow can contain at most 50 nodes" });
  }
  if (edges.length > 120) {
    issues.push({ level: "error", message: "Flow can contain at most 120 routes" });
  }

  return issues;
}
