"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Loader2,
  Radio,
  Phone,
  Save,
  Settings,
  Trash2,
  Wrench,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Switch } from "@/src/components/ui/switch";
import { AgentTabs } from "@/src/components/agents/AgentTabs";
import { toast } from "sonner";
import type { Agent } from "@/src/lib/api/types";
import { AgentPreviewPanel } from "@/src/components/agents/AgentPreviewPanel";
import {
  useAgent,
  useDeleteAgent,
  useUpdateAgent,
} from "@/src/hooks/queries/agents";

function HeaderSkeleton() {
  return (
    <div className="border bg-card p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="size-12" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

function AgentDetailsForm({ agent }: { agent: Agent }) {
  const [draftName, setDraftName] = useState(agent.name);
  const [draftIsActive, setDraftIsActive] = useState(agent.isActive);
  const updateAgent = useUpdateAgent(agent.agentId);

  async function saveAgentDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draftName.trim();
    if (name.length < 2) {
      toast.error("Agent name must be at least 2 characters");
      return;
    }

    try {
      await updateAgent.mutateAsync({ name, isActive: draftIsActive });
      toast.success("Agent details saved");
    } catch {
      // The mutation hook displays the API error.
    }
  }

  return (
    <form
      onSubmit={saveAgentDetails}
      className="border bg-card p-5"
      aria-label="Agent details"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <label
              htmlFor="agent-name"
              className="text-sm font-medium text-foreground"
            >
              Agent name
            </label>
            <Input
              id="agent-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              minLength={2}
              maxLength={100}
              disabled={updateAgent.isPending}
              aria-describedby="agent-name-description"
            />
            <p
              id="agent-name-description"
              className="text-xs text-muted-foreground"
            >
              This name is shown throughout the console.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 border bg-background px-4 py-3 sm:min-w-56">
            <div className="min-w-0">
              <label
                htmlFor="agent-active"
                className="text-sm font-medium text-foreground"
              >
                Active status
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {draftIsActive
                  ? "The agent can receive calls."
                  : "The agent is paused and cannot receive calls."}
              </p>
            </div>
            <Switch
              id="agent-active"
              checked={draftIsActive}
              onCheckedChange={setDraftIsActive}
              disabled={updateAgent.isPending}
              aria-label={draftIsActive ? "Pause agent" : "Activate agent"}
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={
            updateAgent.isPending ||
            draftName.trim().length < 2 ||
            (agent.name === draftName.trim() &&
              agent.isActive === draftIsActive)
          }
          className="w-full lg:w-auto"
        >
          {updateAgent.isPending ? (
            <>
              <Loader2 className="animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save /> Save changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default function AgentConfigPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = params.id;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data: agent, isLoading } = useAgent(agentId);
  const deleteAgent = useDeleteAgent();

  async function confirmDelete() {
    await deleteAgent.mutateAsync(agentId);
    setDeleteOpen(false);
    router.push("/agents");
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to agents
        </Link>
      </div>

      {isLoading ? (
        <HeaderSkeleton />
      ) : !agent ? (
        <div className="border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center border bg-muted/40 text-muted-foreground">
            <Bot className="size-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-foreground">
            Agent not found
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            This agent may have been removed, or you may not have access to it.
          </p>
          <Button asChild className="mt-5">
            <Link href="/agents">Go back to agents</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="border bg-card">
            <div className="flex flex-col gap-5 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center border bg-primary/10 text-primary">
                  <Bot className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                      {agent.name}
                    </h1>
                    <Badge
                      variant={agent.isActive ? "default" : "secondary"}
                      className={
                        agent.isActive
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                          : ""
                      }
                    >
                      {agent.isActive ? "Live" : "Paused"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {agent.isConfigured
                        ? "Configured"
                        : "Needs configuration"}
                    </span>
                    <span className="font-mono">
                      ID {agent.agentId.slice(0, 8)}
                    </span>
                    <span>
                      Updated {new Date(agent.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <Button
                    variant="outline"
                    className="w-full lg:w-auto"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Radio /> Preview
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive lg:w-auto"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 /> Delete agent
                  </Button>
                </div>
                <div className="grid grid-cols-2 border bg-background text-xs sm:grid-cols-4 lg:min-w-[420px]">
                  <div className="border-r px-4 py-3">
                    <p className="font-semibold text-foreground">
                      {agent.phoneNumbersCount}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-muted-foreground">
                      <Phone className="size-3" /> Numbers
                    </p>
                  </div>
                  <div className="border-r px-4 py-3">
                    <p className="font-semibold text-foreground">
                      {agent.callLogsCount}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-muted-foreground">
                      <Settings className="size-3" /> Calls
                    </p>
                  </div>
                  <div className="border-r px-4 py-3">
                    <p className="font-semibold text-foreground">
                      {agent.knowledgeSourcesCount}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-muted-foreground">
                      <BookOpen className="size-3" /> Docs
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="font-semibold text-foreground">
                      {agent.toolsCount}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-muted-foreground">
                      <Wrench className="size-3" /> Tools
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <AgentDetailsForm agent={agent} />

          <AgentTabs agentId={agentId} />
          <AgentPreviewPanel
            agentId={agentId}
            agentName={agent.name}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes {agent.name} and detaches it from phone numbers,
                  tools, and knowledge sources. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  disabled={deleteAgent.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteAgent.isPending ? (
                    <>
                      <Loader2 className="animate-spin" /> Deleting...
                    </>
                  ) : (
                    "Delete"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
