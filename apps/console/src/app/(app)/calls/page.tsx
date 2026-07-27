"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/src/components/common/PageHeader";
import { CallFilters } from "@/src/components/calls/CallFilters";
import { CallsTable } from "@/src/components/calls/CallsTable";
import type { CallListParams } from "@/src/lib/api/resources/calls";
import type { CallStatus } from "@/src/lib/api/types";
import { resolveCallDateFilters } from "@/src/lib/calls/date-filters";

function isStatus(v: string | null): v is CallStatus {
  return (
    v === "COMPLETED" ||
    v === "IN_PROGRESS" ||
    v === "FAILED" ||
    v === "NOT_ANSWERED" ||
    v === "SCHEDULED" ||
    v === "PROCESSED"
  );
}

function isDirection(v: string | null): v is "inbound" | "outbound" {
  return v === "inbound" || v === "outbound";
}

export default function CallsPage() {
  const sp = useSearchParams();
  const [openedAt] = useState(() => new Date());
  const dates = resolveCallDateFilters(
    {
      from: sp.get("from"),
      to: sp.get("to"),
      range: sp.get("range"),
    },
    openedAt,
  );
  const filters: Omit<CallListParams, "cursor" | "limit"> = {
    agentId: sp.get("agentId") ?? undefined,
    status: isStatus(sp.get("status")) ? (sp.get("status") as CallStatus) : undefined,
    direction: isDirection(sp.get("direction")) ? sp.get("direction") as "inbound" | "outbound" : undefined,
    ...dates,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Call History"
        description="View and manage all inbound and outbound call recordings."
      />
      <CallFilters />
      <CallsTable filters={filters} />
    </div>
  );
}
