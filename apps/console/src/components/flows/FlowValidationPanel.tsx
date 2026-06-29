import { AlertCircle, CheckCircle2, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

import type { FlowValidationIssue } from "./flow-validation";

interface FlowValidationPanelProps {
  issues: FlowValidationIssue[];
  onSelectIssue?: (issue: FlowValidationIssue) => void;
}

export function FlowValidationPanel({ issues, onSelectIssue }: FlowValidationPanelProps) {
  const errors = issues.filter((issue) => issue.level === "error").length;

  return (
    <section className="border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {errors ? <AlertCircle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
          <span>Validation</span>
        </div>
        <span className="text-xs text-muted-foreground">{issues.length} issues</span>
      </div>
      {issues.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">Ready to save.</div>
      ) : (
        <div className="divide-y">
          {issues.map((issue, index) => (
            <Button
              key={`${issue.nodeId ?? issue.edgeId ?? "flow"}-${index}`}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left"
              onClick={() => onSelectIssue?.(issue)}
            >
              <TriangleAlert
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  issue.level === "error" ? "text-destructive" : "text-amber-500"
                )}
              />
              <span className="min-w-0 flex-1 whitespace-normal text-xs leading-relaxed text-muted-foreground">
                {issue.message}
              </span>
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
