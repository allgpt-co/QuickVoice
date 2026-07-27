"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { useAgents } from "@/src/hooks/queries/agents";

const ALL = "__all__";
const RANGE_LABELS: Record<string, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export function CallFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: agents } = useAgents();

  const agentId = params.get("agentId") ?? ALL;
  const status = params.get("status") ?? ALL;
  const direction = params.get("direction") ?? ALL;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const range = params.get("range") ?? "";

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (key === "from" || key === "to") next.delete("range");
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function reset() {
    router.replace(pathname);
  }

  const hasFilters =
    agentId !== ALL ||
    status !== ALL ||
    direction !== ALL ||
    Boolean(from) ||
    Boolean(to) ||
    Boolean(range);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGE_LABELS[range] ? (
        <Badge variant="outline">{RANGE_LABELS[range]}</Badge>
      ) : null}
      <Select value={agentId} onValueChange={(v) => update("agentId", v)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All agents" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All agents</SelectItem>
          {(agents ?? []).map((a) => (
            <SelectItem key={a.agentId} value={a.agentId}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(v) => update("status", v)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any status</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
          <SelectItem value="IN_PROGRESS">In progress</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
          <SelectItem value="NOT_ANSWERED">Not answered</SelectItem>
          <SelectItem value="SCHEDULED">Scheduled</SelectItem>
        </SelectContent>
      </Select>

      <Select value={direction} onValueChange={(v) => update("direction", v)}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Any direction" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any direction</SelectItem>
          <SelectItem value="inbound">Inbound</SelectItem>
          <SelectItem value="outbound">Outbound</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={from}
        onChange={(e) => update("from", e.target.value || null)}
        className="w-[150px]"
      />
      <Input
        type="date"
        value={to}
        onChange={(e) => update("to", e.target.value || null)}
        className="w-[150px]"
      />

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}
