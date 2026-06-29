import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PhoneIncoming } from "lucide-react";

import { cn } from "@/src/lib/utils";

import type { FlowBuilderNode } from "../flow-types";

export function StartNode({ data, selected }: NodeProps<FlowBuilderNode>) {
  return (
    <>
      <div
        className={cn(
          "flex h-24 w-64 flex-col justify-between border bg-card p-3 shadow-sm",
          selected && "border-primary ring-2 ring-primary/20"
        )}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PhoneIncoming className="size-4 text-primary" />
          <span className="truncate">{data.label}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">Start</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
