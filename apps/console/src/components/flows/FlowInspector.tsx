import { Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import type { Agent, FlowEdgeType } from "@/src/lib/api/types";

import type { FlowBuilderEdge, FlowBuilderNode, FlowEdgeData, FlowNodeData } from "./flow-types";

const NO_AGENT = "__none__";

interface FlowInspectorProps {
  agents: Agent[];
  selectedNode: FlowBuilderNode | null;
  selectedEdge: FlowBuilderEdge | null;
  onUpdateNode: (nodeId: string, data: Partial<FlowNodeData>) => void;
  onUpdateEdge: (edgeId: string, data: Partial<FlowEdgeData>) => void;
  onDeleteSelection: () => void;
}

export function FlowInspector({
  agents,
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteSelection,
}: FlowInspectorProps) {
  if (!selectedNode && !selectedEdge) {
    return (
      <section className="border bg-card">
        <div className="border-b px-4 py-3 text-sm font-semibold">Inspector</div>
        <div className="px-4 py-6 text-sm text-muted-foreground">Select a node or route.</div>
      </section>
    );
  }

  if (selectedNode) {
    const canDelete = selectedNode.data.nodeType !== "start";
    const usesAgent = selectedNode.data.nodeType === "start" || selectedNode.data.nodeType === "agent";

    return (
      <section className="border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Node</p>
            <p className="text-xs text-muted-foreground">{selectedNode.data.nodeType}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canDelete}
            onClick={onDeleteSelection}
            aria-label="Delete node"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="flow-node-label">Label</Label>
            <Input
              id="flow-node-label"
              value={selectedNode.data.label}
              onChange={(event) => onUpdateNode(selectedNode.id, { label: event.target.value })}
            />
          </div>

          {usesAgent && (
            <div className="space-y-1.5">
              <Label>Agent</Label>
              <Select
                value={selectedNode.data.agentId ?? NO_AGENT}
                onValueChange={(value) =>
                  onUpdateNode(selectedNode.id, { agentId: value === NO_AGENT ? undefined : value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AGENT}>No agent</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.agentId} value={agent.agentId}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {usesAgent && (
            <div className="space-y-1.5">
              <Label htmlFor="flow-transfer-message">Transfer message</Label>
              <Textarea
                id="flow-transfer-message"
                rows={4}
                value={selectedNode.data.transferMessage ?? ""}
                onChange={(event) =>
                  onUpdateNode(selectedNode.id, { transferMessage: event.target.value || undefined })
                }
              />
            </div>
          )}

          {usesAgent && (
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <Label htmlFor="flow-enable-first-message" className="text-sm">First message</Label>
              <Switch
                id="flow-enable-first-message"
                checked={Boolean(selectedNode.data.enableFirstMessage)}
                onCheckedChange={(checked) => onUpdateNode(selectedNode.id, { enableFirstMessage: checked })}
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!selectedEdge) return null;
  const edgeType = selectedEdge.data?.edgeType ?? "llm_condition";

  return (
    <section className="border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Route</p>
          <p className="text-xs text-muted-foreground">{selectedEdge.source} to {selectedEdge.target}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDeleteSelection} aria-label="Delete route">
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="flow-edge-label">Label</Label>
          <Input
            id="flow-edge-label"
            value={selectedEdge.data?.label ?? ""}
            onChange={(event) => onUpdateEdge(selectedEdge.id, { label: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select
            value={edgeType}
            onValueChange={(value) =>
              onUpdateEdge(selectedEdge.id, {
                edgeType: value as FlowEdgeType,
                condition: value === "default" ? undefined : selectedEdge.data?.condition ?? "",
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="llm_condition">LLM condition</SelectItem>
              <SelectItem value="default">Default</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {edgeType === "llm_condition" && (
          <div className="space-y-1.5">
            <Label htmlFor="flow-edge-condition">Condition</Label>
            <Textarea
              id="flow-edge-condition"
              rows={5}
              value={selectedEdge.data?.condition ?? ""}
              onChange={(event) => onUpdateEdge(selectedEdge.id, { condition: event.target.value })}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="flow-edge-priority">Priority</Label>
          <Input
            id="flow-edge-priority"
            type="number"
            min={0}
            max={1000}
            value={selectedEdge.data?.priority ?? 0}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              onUpdateEdge(selectedEdge.id, { priority: Number.isFinite(next) ? next : 0 });
            }}
          />
        </div>
      </div>
    </section>
  );
}
