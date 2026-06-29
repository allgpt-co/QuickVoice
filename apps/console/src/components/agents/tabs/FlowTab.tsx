"use client";

import { useState } from "react";
import { GitBranch, Loader2, Plus } from "lucide-react";

import { EmptyState, LoadingState } from "@/src/components/common/EmptyState";
import { FlowBuilder } from "@/src/components/flows/FlowBuilder";
import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useAgents } from "@/src/hooks/queries/agents";
import { useAgentFlows, useCreateFlow } from "@/src/hooks/queries/flows";
import type { AgentFlowGraph } from "@/src/lib/api/types";

function createDefaultGraph(agentId: string): AgentFlowGraph {
  return {
    version: 1,
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 0, y: 0 },
        data: { label: "General inquiry", agentId },
      },
      {
        id: "end",
        type: "end",
        position: { x: 700, y: 0 },
        data: { label: "End call" },
      },
    ],
    edges: [
      {
        id: "start-end",
        source: "start",
        target: "end",
        type: "default",
        data: { label: "Fallback", priority: 100 },
      },
    ],
  };
}

export function FlowTab({ agentId }: { agentId: string }) {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const { data: flows = [], isLoading: flowsLoading } = useAgentFlows(agentId);
  const { data: agents = [], isLoading: agentsLoading } = useAgents();
  const createFlow = useCreateFlow();
  const selectedFlow =
    flows.find((flow) => flow.flowId === selectedFlowId) ??
    flows.find((flow) => flow.isActive) ??
    flows[0] ??
    null;

  async function handleCreateFlow() {
    try {
      const flow = await createFlow.mutateAsync({
        rootAgentId: agentId,
        name: "Support flow",
        description: "Route callers from the general agent to specialist agents.",
        graphJson: createDefaultGraph(agentId),
        isActive: false,
      });
      setSelectedFlowId(flow.flowId);
    } catch {
      // Error toast is handled by the mutation hook.
    }
  }

  if (flowsLoading || agentsLoading) {
    return (
      <LoadingState
        title="Loading flows"
        description="Fetching this agent's routing configuration."
      />
    );
  }

  if (flows.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No flow configured"
        description="Create a routing flow to send callers from this agent to specialist agents."
        action={
          <Button onClick={handleCreateFlow} disabled={createFlow.isPending}>
            {createFlow.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Create flow
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Agent flow</h2>
          <p className="text-sm text-muted-foreground">
            Choose a saved flow, then edit routes and active status in the builder.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={selectedFlow?.flowId} onValueChange={setSelectedFlowId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Select flow" />
            </SelectTrigger>
            <SelectContent>
              {flows.map((flow) => (
                <SelectItem key={flow.flowId} value={flow.flowId}>
                  {flow.name}{flow.isActive ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleCreateFlow} disabled={createFlow.isPending}>
            {createFlow.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            New flow
          </Button>
        </div>
      </div>

      <FlowBuilder
        rootAgentId={agentId}
        agents={agents}
        flow={selectedFlow}
        onSaved={(flow) => setSelectedFlowId(flow.flowId)}
      />
    </div>
  );
}
