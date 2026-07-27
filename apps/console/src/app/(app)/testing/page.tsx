import Link from "next/link";
import { Bot, ClipboardCheck, FileText, FlaskConical, PhoneCall } from "lucide-react";

import { PageHeader } from "@/src/components/common/PageHeader";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { CONSOLE_LIFECYCLE_AREAS } from "@/src/lib/console-ia";

const testingWorkflows = [
  {
    title: "Agent behavior checks",
    description: "Open an agent, review its Behavior and Analysis tabs, and confirm prompts, variables, and evaluation criteria before routing calls.",
    href: "/agents",
    action: "Open agents",
    icon: Bot,
  },
  {
    title: "Preview and provider readiness",
    description: "Use preview only after required voice, LiveKit, and model-provider settings are configured for the selected agent.",
    href: "/agents",
    action: "Review setup",
    icon: FlaskConical,
  },
  {
    title: "Call-log review",
    description: "Inspect recent recordings, transcripts, durations, statuses, and handoff quality using synthetic or authorized call data.",
    href: "/calls",
    action: "Review calls",
    icon: PhoneCall,
  },
  {
    title: "Knowledge and tool coverage",
    description: "Check whether the agent has the knowledge sources, MCP tools, HTTP tools, and secrets needed for the tested workflow.",
    href: "/kb",
    action: "Check knowledge",
    icon: FileText,
  },
];

export default function TestingPage() {
  const area = CONSOLE_LIFECYCLE_AREAS.test;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testing"
        description={area.description}
        actions={
          <Button asChild>
            <Link href="/agents">Start from an agent</Link>
          </Button>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Pre-deployment checklist</CardTitle>
                <CardDescription>Use these checkpoints before assigning numbers or launching outbound traffic.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              "Agent prompt and first message are reviewed",
              "Dynamic variables have safe fallback behavior",
              "Knowledge sources and tools are intentionally allowed",
              "Provider credentials and limits are understood",
            ].map((item) => (
              <div key={item} className="rounded-xl border bg-muted/30 p-4 text-sm text-foreground">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Lifecycle vocabulary</CardTitle>
            <CardDescription>Testing sits between Build and Deploy; failures should point to the exact next remediation step.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {area.resourceTypes.map((type) => (
              <Badge key={type} variant="outline" className="h-7 rounded-full px-3 capitalize">
                {type.replace(/_/g, " ")}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {testingWorkflows.map((workflow) => {
          const Icon = workflow.icon;
          return (
            <Card key={workflow.title} className="rounded-2xl transition-colors hover:border-primary/40">
              <CardHeader className="gap-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-2">
                  <CardTitle className="text-base">{workflow.title}</CardTitle>
                  <CardDescription>{workflow.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link href={workflow.href}>{workflow.action}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
