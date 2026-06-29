import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";

import { cn } from "@/src/lib/utils";

import type { FlowBuilderNode } from "../flow-types";

export function AgentNode({ data, selected }: NodeProps<FlowBuilderNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div
        className={cn(
          "flex h-24 w-64 flex-col justify-between border bg-card p-3 shadow-sm",
          selected && "border-primary ring-2 ring-primary/20"
        )}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="size-4 text-primary" />
          <span className="truncate">{data.label}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {data.agentId ? "Agent selected" : "No agent selected"}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
