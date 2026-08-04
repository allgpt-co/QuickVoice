"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Search,
  SquareX,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/src/components/common/EmptyState";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import { Progress } from "@/src/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useAgents } from "@/src/hooks/queries/agents";
import {
  useBatchCampaign,
  useBatchCampaigns,
  useCancelBatchCampaign,
  useDownloadBatchCampaignResults,
} from "@/src/hooks/queries/outbound";
import type { BatchCampaign } from "@/src/lib/api/resources/outbound";

type CampaignStatus = BatchCampaign["status"];

const STATUS_OPTIONS: Array<"all" | CampaignStatus> = [
  "all",
  "SCHEDULED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "PROCESSED",
  "FAILED",
];

function fmtDate(value: string | null) {
  if (!value) return "Instant";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

function statusVariant(status: CampaignStatus) {
  if (status === "FAILED" || status === "CANCELLED")
    return "destructive" as const;
  if (status === "COMPLETED") return "default" as const;
  if (status === "ACTIVE") return "secondary" as const;
  return "outline" as const;
}

function canCancelCampaign(status: CampaignStatus) {
  return status === "SCHEDULED" || status === "PROCESSED";
}

function completionPercent(campaign: BatchCampaign) {
  if (!campaign.totalRecipients) return 0;
  const completed = campaign.validRecipients + campaign.invalidRecipients;
  return Math.min(
    100,
    Math.round((completed / campaign.totalRecipients) * 100),
  );
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCampaignCsv(
  campaigns: BatchCampaign[],
  agentName: (id: string | null) => string,
) {
  const header = [
    "Campaign",
    "Status",
    "Agent",
    "From number",
    "Scheduled at",
    "Total recipients",
    "Valid recipients",
    "Invalid recipients",
    "Source file",
    "Created at",
  ];
  const rows = campaigns.map((campaign) => [
    campaign.name,
    campaign.status,
    agentName(campaign.agentId),
    campaign.fromNumber,
    campaign.scheduledAt ?? "Instant",
    campaign.totalRecipients,
    campaign.validRecipients,
    campaign.invalidRecipients,
    campaign.sourceFileName ?? "",
    campaign.createdAt,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quickvoice-campaigns.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function CampaignDetailDialog({
  campaign,
  onOpenChange,
}: {
  campaign: BatchCampaign | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: detail, isLoading } = useBatchCampaign(campaign?.campaignId);
  const shown = detail ?? campaign;
  const calls = shown?.outboundCalls ?? [];

  return (
    <Dialog open={!!campaign} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{shown?.name ?? "Campaign"}</DialogTitle>
          <DialogDescription>
            Campaign schedule, recipient counts, and imported outbound calls.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !shown ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge
                  className="mt-2 capitalize"
                  variant={statusVariant(shown.status)}
                >
                  {statusLabel(shown.status)}
                </Badge>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {shown.totalRecipients}
                </p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Valid</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {shown.validRecipients}
                </p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Invalid</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {shown.invalidRecipients}
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">From number</p>
                <p className="mt-1 font-medium">{shown.fromNumber}</p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="mt-1 font-medium">{fmtDate(shown.scheduledAt)}</p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Source file</p>
                <p className="mt-1 truncate font-medium">
                  {shown.sourceFileName ?? "-"}
                </p>
              </div>
              <div className="border p-3">
                <p className="text-xs text-muted-foreground">Ring timeout</p>
                <p className="mt-1 font-medium">
                  {shown.ringingTimeoutSeconds} seconds
                </p>
              </div>
            </div>

            <div className="border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-semibold">Imported calls</p>
                <Badge variant="outline">{calls.length}</Badge>
              </div>
              <div className="max-h-72 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calls.length ? (
                      calls.slice(0, 50).map((call) => (
                        <TableRow key={call.outboundId}>
                          <TableCell className="font-mono text-xs">
                            {call.phoneNumber}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {statusLabel(call.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fmtDate(call.updatedAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No calls imported yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CampaignsPanel() {
  const {
    data: campaigns = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useBatchCampaigns();
  const { data: agents = [] } = useAgents();
  const cancelCampaign = useCancelBatchCampaign();
  const downloadResults = useDownloadBatchCampaignResults();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CampaignStatus>("all");
  const [selectedCampaign, setSelectedCampaign] =
    useState<BatchCampaign | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BatchCampaign | null>(null);

  const agentNames = useMemo(
    () => new Map(agents.map((agent) => [agent.agentId, agent.name])),
    [agents],
  );

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const statusMatches = status === "all" || campaign.status === status;
      if (!statusMatches) return false;
      if (!query) return true;
      return [
        campaign.name,
        campaign.fromNumber,
        campaign.sourceFileName ?? "",
        agentNames.get(campaign.agentId ?? "") ?? "-",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [agentNames, campaigns, search, status]);

  async function confirmCancel() {
    if (!cancelTarget) return;
    await cancelCampaign.mutateAsync(cancelTarget.campaignId, {
      onSuccess: () => setCancelTarget(null),
    });
  }

  function exportCampaignResults(campaign: BatchCampaign) {
    downloadResults.mutate(campaign.campaignId);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Could not load campaigns"
        description="Refresh campaign management or try again after checking your connection."
        action={
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search campaigns, agents, numbers, or files"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as typeof status)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((item) => (
              <SelectItem key={item} value={item} className="capitalize">
                {item === "all" ? "All statuses" : statusLabel(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            downloadCampaignCsv(
              filteredCampaigns,
              (id) => agentNames.get(id ?? "") ?? "-",
            );
            toast.success("Campaign export downloaded");
          }}
          disabled={!filteredCampaigns.length}
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {!filteredCampaigns.length ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No campaigns found"
          description="Create a batch campaign or adjust the current filters."
        />
      ) : (
        <div className="border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.map((campaign) => (
                <TableRow key={campaign.campaignId}>
                  <TableCell>
                    <div className="min-w-64 space-y-1">
                      <p className="font-medium">{campaign.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {agentNames.get(campaign.agentId ?? "") ?? "-"} ·{" "}
                        {campaign.sourceFileName ?? "No source file"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="capitalize"
                      variant={statusVariant(campaign.status)}
                    >
                      {statusLabel(campaign.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-40 space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {campaign.validRecipients}/{campaign.totalRecipients}
                        </span>
                        <span>{campaign.invalidRecipients} invalid</span>
                      </div>
                      <Progress value={completionPercent(campaign)} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarClock className="size-4" />
                      {fmtDate(campaign.scheduledAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <Phone className="size-4 text-muted-foreground" />
                      {campaign.fromNumber}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${campaign.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Campaign actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => setSelectedCampaign(campaign)}
                        >
                          <FileSpreadsheet className="size-4" />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => exportCampaignResults(campaign)}
                          disabled={downloadResults.isPending}
                        >
                          {downloadResults.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Download className="size-4" />
                          )}
                          Export results CSV
                        </DropdownMenuItem>
                        {canCancelCampaign(campaign.status) ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setCancelTarget(campaign)}
                            >
                              <SquareX className="size-4" />
                              Cancel campaign
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CampaignDetailDialog
        campaign={selectedCampaign}
        onOpenChange={(open) => {
          if (!open) setSelectedCampaign(null);
        }}
      />

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open && !cancelCampaign.isPending) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This prevents {cancelTarget?.name} from dispatching queued calls.
              Calls already in progress cannot be stopped from this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelCampaign.isPending}>
              Keep campaign
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                confirmCancel();
              }}
              disabled={cancelCampaign.isPending}
            >
              {cancelCampaign.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Cancel campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
