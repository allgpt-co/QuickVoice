import { GitBranch, LockKeyhole, ShieldCheck } from "lucide-react";

import { Button } from "@/src/components/ui/button";

const workflowsBetaEnabled = process.env.NEXT_PUBLIC_WORKFLOWS_BETA_ENABLED === "true";

export function WorkflowTab({ agentId }: Readonly<{ agentId: string }>) {
  return (
    <section className="border bg-card p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground">
            <GitBranch className="size-3.5" aria-hidden="true" /> Workflow beta
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Visual workflow drafts are not enabled for this agent yet
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Current prompt, model, tools, knowledge, phone number, preview, and call paths stay unchanged. Workflow authoring must be enabled explicitly before any draft editor or future runtime path is available.
            </p>
          </div>
        </div>
        <Button disabled={!workflowsBetaEnabled} aria-disabled={!workflowsBetaEnabled}>
          Enable workflow draft
        </Button>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <WorkflowGuardrail
          icon={LockKeyhole}
          title="Fail-closed flag"
          description={
            workflowsBetaEnabled
              ? "The beta flag is enabled, but execution remains separate from draft authoring."
              : "Set NEXT_PUBLIC_WORKFLOWS_BETA_ENABLED=true only after the backend draft APIs are ready."
          }
        />
        <WorkflowGuardrail
          icon={ShieldCheck}
          title="No silent conversion"
          description="Legacy prompt-based agents remain the production source until a workflow draft is explicitly created and published."
        />
        <WorkflowGuardrail
          icon={GitBranch}
          title="Versioned contract"
          description={`Compatibility adapter is available for agent ${agentId.slice(0, 8)} without changing active calls.`}
        />
      </div>
    </section>
  );
}

function WorkflowGuardrail({
  icon: Icon,
  title,
  description,
}: Readonly<{
  icon: typeof GitBranch;
  title: string;
  description: string;
}>) {
  return (
    <div className="border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
