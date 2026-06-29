"use client";

import { useCallback, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";

import type { Agent, AgentFlow } from "@/src/lib/api/types";
import { useCreateFlow, useUpdateFlow } from "@/src/hooks/queries/flows";
import { cn } from "@/src/lib/utils";

import { FlowInspector } from "./FlowInspector";
import { FlowToolbar } from "./FlowToolbar";
import { TestFlowDialog } from "./TestFlowDialog";
import { FlowValidationPanel } from "./FlowValidationPanel";
import {
  FLOW_NODE_HEIGHT,
  FLOW_NODE_WIDTH,
  createDefaultFlowGraph,
  createFlowEdge,
  createFlowNode,
  flowElementsToGraph,
  graphToFlowElements,
  type FlowBuilderEdge,
  type FlowBuilderNode,
  type FlowEdgeData,
  type FlowNodeData,
} from "./flow-types";
import { validateFlow, type FlowValidationIssue } from "./flow-validation";
import { AgentNode } from "./nodes/AgentNode";
import { EndNode } from "./nodes/EndNode";
import { StartNode } from "./nodes/StartNode";

const nodeTypes = {
  start: StartNode,
  agent: AgentNode,
  end: EndNode,
} satisfies NodeTypes;

interface FlowBuilderProps {
  rootAgentId: string;
  agents: Agent[];
  flow?: AgentFlow | null;
  className?: string;
  onSaved?: (flow: AgentFlow) => void;
}

function layoutNodes(nodes: FlowBuilderNode[], edges: FlowBuilderEdge[]): FlowBuilderNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 56, ranksep: 96 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    if (!position) return node;
    return {
      ...node,
      position: {
        x: position.x - FLOW_NODE_WIDTH / 2,
        y: position.y - FLOW_NODE_HEIGHT / 2,
      },
    };
  });
}

function getMetadataIssues(name: string, description: string): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    issues.push({ level: "error", message: "Flow name must be 2 to 120 characters" });
  }
  if (description.length > 500) {
    issues.push({ level: "error", message: "Flow description must be 500 characters or fewer" });
  }
  return issues;
}

export function FlowBuilder(props: FlowBuilderProps) {
  const builderKey = props.flow?.flowId ?? `new-${props.rootAgentId}`;
  return <FlowBuilderEditor key={builderKey} {...props} />;
}

function FlowBuilderEditor({ rootAgentId, agents, flow, className, onSaved }: FlowBuilderProps) {
  const createFlow = useCreateFlow();
  const updateFlow = useUpdateFlow(flow?.flowId ?? "");
  const initial = useMemo(
    () => graphToFlowElements(flow?.graphJson ?? createDefaultFlowGraph(rootAgentId)),
    [flow?.graphJson, rootAgentId]
  );
  const [nodes, setNodes] = useState<FlowBuilderNode[]>(() => initial.nodes);
  const [edges, setEdges] = useState<FlowBuilderEdge[]>(() => initial.edges);
  const [name, setName] = useState(flow?.name ?? "Support flow");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [isActive, setIsActive] = useState(Boolean(flow?.isActive));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const issues = useMemo(
    () => [
      ...getMetadataIssues(name, description),
      ...validateFlow({ nodes, edges, rootAgentId, agents }),
    ],
    [name, description, nodes, edges, rootAgentId, agents]
  );
  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const isSaving = createFlow.isPending || updateFlow.isPending;
  const canSave = errorCount === 0 && !isSaving;
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) ?? null : null;

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
  }, []);

  const selectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
    setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === edgeId })));
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<FlowBuilderNode>[]) => {
    setNodes((current) => {
      const filtered = changes.filter((change) => {
        if (change.type !== "remove") return true;
        const node = current.find((candidate) => candidate.id === change.id);
        return node?.data.nodeType !== "start";
      });
      return applyNodeChanges(filtered, current);
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowBuilderEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode) return false;
      if (sourceNode.data.nodeType === "end") return false;
      if (targetNode.data.nodeType === "start") return false;
      return !edges.some((edge) => edge.source === connection.source && edge.target === connection.target);
    },
    [nodes, edges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !isValidConnection(connection)) return;
      setEdges((current) => [
        ...current,
        createFlowEdge(
          connection.source as string,
          connection.target as string,
          current.filter((edge) => edge.source === connection.source).length * 10
        ),
      ]);
    },
    [isValidConnection]
  );

  const updateNode = useCallback((nodeId: string, data: Partial<FlowNodeData>) => {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node))
    );
  }, []);

  const updateEdge = useCallback((edgeId: string, data: Partial<FlowEdgeData>) => {
    setEdges((current) =>
      current.map((edge) => {
        if (edge.id !== edgeId) return edge;
        const nextData = { ...edge.data, ...data } as FlowEdgeData;
        return {
          ...edge,
          label: nextData.label,
          data: nextData,
          className: nextData.edgeType === "default" ? "stroke-muted-foreground" : undefined,
        };
      })
    );
  }, []);

  const deleteSelection = useCallback(() => {
    if (selectedNode) {
      if (selectedNode.data.nodeType === "start") return;
      setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
      setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
      clearSelection();
      return;
    }
    if (selectedEdge) {
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id));
      clearSelection();
    }
  }, [selectedNode, selectedEdge, clearSelection]);

  const addAgentNode = useCallback(() => {
    setNodes((current) => [...current, createFlowNode("agent", current.length)]);
  }, []);

  const addEndNode = useCallback(() => {
    setNodes((current) => [...current, createFlowNode("end", current.length)]);
  }, []);

  const autoLayout = useCallback(() => {
    setNodes((current) => layoutNodes(current, edges));
  }, [edges]);

  const saveFlow = useCallback(async () => {
    if (!canSave) return;
    const graph = flowElementsToGraph(nodes, edges);
    const input = {
      rootAgentId,
      name: name.trim(),
      description: description.trim() || undefined,
      graphJson: graph,
      isActive,
    };
    const saved = flow?.flowId
      ? await updateFlow.mutateAsync(input)
      : await createFlow.mutateAsync(input);
    onSaved?.(saved);
  }, [canSave, nodes, edges, rootAgentId, name, description, isActive, flow?.flowId, updateFlow, createFlow, onSaved]);

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]", className)}>
      <div className="min-w-0 border bg-background">
        <div className="h-[720px] min-h-[560px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_event, node) => selectNode(node.id)}
            onEdgeClick={(_event, edge) => selectEdge(edge.id)}
            onPaneClick={clearSelection}
            fitView
          >
            <Background gap={20} />
            <Controls />
            <MiniMap pannable zoomable />
            <Panel position="top-left">
              <FlowToolbar
                name={name}
                description={description}
                isActive={isActive}
                canSave={canSave}
                isSaving={isSaving}
                errorCount={errorCount}
                onNameChange={setName}
                onDescriptionChange={setDescription}
                onActiveChange={setIsActive}
                onAddAgent={addAgentNode}
                onAddEnd={addEndNode}
                onAutoLayout={autoLayout}
                onSave={saveFlow}
                onTest={() => setTestOpen(true)}
                canTest={Boolean(flow?.flowId)}
              />
            </Panel>
          </ReactFlow>
        </div>
      </div>

      <div className="space-y-4">
        <FlowInspector
          agents={agents}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          onUpdateNode={updateNode}
          onUpdateEdge={updateEdge}
          onDeleteSelection={deleteSelection}
        />
        <FlowValidationPanel
          issues={issues}
          onSelectIssue={(issue) => {
            if (issue.nodeId) selectNode(issue.nodeId);
            if (issue.edgeId) selectEdge(issue.edgeId);
          }}
        />
      </div>
      <TestFlowDialog flowId={flow?.flowId ?? null} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}
