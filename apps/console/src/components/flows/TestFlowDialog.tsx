"use client";

import { useState } from "react";
import { Loader2, PlayCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { useRunFlowTest } from "@/src/hooks/queries/flows";

interface TestFlowDialogProps {
  flowId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PathStep = {
  nodeId?: string;
  nodeLabel?: string;
  agentId?: string | null;
  reason?: string | null;
};

function isPathStep(value: unknown): value is PathStep {
  return typeof value === "object" && value !== null;
}

export function TestFlowDialog({ flowId, open, onOpenChange }: TestFlowDialogProps) {
  const [customerMessage, setCustomerMessage] = useState("I need to return my order");
  const runTest = useRunFlowTest(flowId ?? "");
  const result = runTest.data;
  const path = (result?.path ?? []).filter(isPathStep);

  async function handleRun() {
    if (!flowId || !customerMessage.trim()) return;
    try {
      await runTest.mutateAsync({
        messages: [{ role: "user", content: customerMessage.trim() }],
      });
    } catch {
      // Error toast is handled by the mutation hook.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test flow</DialogTitle>
          <DialogDescription>
            Run a text-only simulation through the saved flow graph.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="flow-test-message">Customer message</Label>
            <Textarea
              id="flow-test-message"
              rows={4}
              value={customerMessage}
              onChange={(event) => setCustomerMessage(event.target.value)}
            />
          </div>

          {result ? (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="border bg-card">
                <div className="border-b px-3 py-2 text-sm font-semibold">Path</div>
                {path.length ? (
                  <ol className="divide-y">
                    {path.map((step, index) => (
                      <li key={`${step.nodeId ?? "node"}-${step.agentId ?? "agent"}-${index}`} className="px-3 py-2">
                        <div className="flex items-center justify-between gap-3 text-sm font-medium">
                          <span className="truncate">{step.nodeLabel ?? step.nodeId ?? "Unknown node"}</span>
                          {step.agentId ? (
                            <span className="truncate text-xs text-muted-foreground">{step.agentId}</span>
                          ) : null}
                        </div>
                        {step.reason ? (
                          <p className="mt-1 text-xs text-muted-foreground">{step.reason}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="px-3 py-4 text-sm text-muted-foreground">No path returned.</div>
                )}
              </section>

              <section className="border bg-card">
                <div className="border-b px-3 py-2 text-sm font-semibold">Warnings</div>
                {result.warnings.length ? (
                  <ul className="divide-y">
                    {result.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`} className="flex gap-2 px-3 py-2 text-sm text-muted-foreground">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-4 text-sm text-muted-foreground">No warnings.</div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleRun}
            disabled={!flowId || !customerMessage.trim() || runTest.isPending}
          >
            {runTest.isPending ? <Loader2 className="animate-spin" /> : <PlayCircle />}
            Run test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
