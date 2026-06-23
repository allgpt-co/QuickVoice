"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  PhoneCall,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import { useAgents } from "@/src/hooks/queries/agents";
import { dashboardCallsHref } from "@/src/components/dashboard/call-filter-links";
import type {
  AgentBucket,
  DashboardRange,
  DashboardSummary,
} from "@/src/lib/api/resources/dashboard";
import type { Agent } from "@/src/lib/api/types";

function resolveAgentName({
  agent,
  agents,
  agentsLoading,
  agentsError,
}: {
  agent: AgentBucket;
  agents?: Agent[];
  agentsLoading: boolean;
  agentsError: boolean;
}) {
  if (!agent.agentId) return "Unassigned";
  if (agentsLoading) return "Resolving agent";
  if (agentsError) return "Agent name unavailable";
  return (
    agents?.find((knownAgent) => knownAgent.agentId === agent.agentId)?.name ??
    "Unknown agent"
  );
}

export function AgentActivityList({
  summary,
  range,
  loading,
}: {
  summary?: DashboardSummary;
  range: DashboardRange;
  loading?: boolean;
}) {
  const {
    data: agents,
    isLoading: agentsLoading,
    isError: agentsError,
  } = useAgents();

  const top = summary?.topAgents ?? [];
  const max = top[0]?.calls ?? 1;
  const totalCalls = top.reduce((sum, agent) => sum + agent.calls, 0);
  const hasAgentLookupGap = agentsError && top.some((agent) => agent.agentId);

  return (
    <div className="border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agent activity
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">Top agents</h3>
          <p className="text-xs text-muted-foreground">
            Ranked by call volume in this period.
          </p>
        </div>
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Manage <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 border-b bg-muted/20 text-xs">
        <div className="border-r px-5 py-3">
          <p className="font-semibold text-foreground">{top.length}</p>
          <p className="text-muted-foreground">active agents</p>
        </div>
        <div className="px-5 py-3">
          <p className="font-semibold text-foreground">{totalCalls}</p>
          <p className="text-muted-foreground">assigned calls</p>
        </div>
      </div>
      {hasAgentLookupGap ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-xs text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Partial agent data:</span> call
            counts loaded, but agent names could not be resolved. Use the call
            links to inspect the source records.
          </span>
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-4 p-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !top.length ? (
        <EmptyState
          icon={Bot}
          title="No agent activity"
          description="Create an agent and connect it to a number to see activity."
          className="border-0"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild size="sm">
                <Link href="/agents">Create agent</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/numbers">Connect number</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4 p-5">
          {top.map((agent, index) => {
            const pct = Math.max(4, Math.round((agent.calls / max) * 100));
            const successPct = Math.round(agent.successRate * 100);
            const agentName = resolveAgentName({
              agent,
              agents,
              agentsLoading,
              agentsError,
            });
            return (
              <Link
                key={agent.agentId ?? "unknown"}
                href={dashboardCallsHref({ range, agentId: agent.agentId })}
                className="group block border bg-background p-3 transition-colors hover:border-primary/35 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`View calls for ${agentName} in the selected dashboard range`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center border bg-card text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {agentName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <PhoneCall className="size-3" />
                            {agent.calls} calls
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="size-3" />
                            {successPct}% success
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">{agent.minutes}m</p>
                        <p>talk time</p>
                        <p className="mt-1 inline-flex items-center gap-1 font-medium text-primary">
                          View calls
                          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                        </p>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden bg-muted">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
