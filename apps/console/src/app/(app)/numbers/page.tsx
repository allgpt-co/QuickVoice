"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertCircle,
    CalendarClock,
    Check,
    Copy,
    Filter,
    Hash,
    Phone,
    RefreshCw,
    Route,
    Search,
    Signal,
    X,
} from "lucide-react";

import { PageHeader } from "@/src/components/common/PageHeader";
import { EmptyState } from "@/src/components/common/EmptyState";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Input } from "@/src/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/src/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/src/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { BuyNumberDrawer } from "@/src/components/numbers/BuyNumberDrawer";
import { AssignAgentSelect } from "@/src/components/numbers/AssignAgentSelect";
import { ReleaseNumberDialog } from "@/src/components/numbers/ReleaseNumberDialog";
import { useNumbers } from "@/src/hooks/queries/numbers";
import type { PhoneNumber, PhoneNumberBillingStatus } from "@/src/lib/api/types";
import { authClient } from "@/src/lib/auth-client";
import { isBuiltInNumberManager } from "@/src/lib/numbers/permissions";
import { cn } from "@/src/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string) {
    return new Date(value).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
    });
}

function formatRentalPrice(
    value: PhoneNumber["rentalPriceMicros"] | undefined,
) {
    if (value === null || value === undefined) return null;
    const micros = Number(value);
    if (!Number.isFinite(micros)) return null;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(micros / 1_000_000);
}

const BILLING_STATUS_META: Record<
    PhoneNumberBillingStatus,
    { label: string; className: string }
> = {
    ACTIVE: {
        label: "Active",
        className: "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    },
    SUSPENDED: {
        label: "Suspended",
        className: "border-amber-500/30 text-amber-700 dark:text-amber-300",
    },
    RELEASE_PENDING: {
        label: "Release pending",
        className: "border-destructive/30 text-destructive",
    },
    RELEASING: {
        label: "Release in progress",
        className: "border-destructive/30 text-destructive",
    },
    RELEASED: {
        label: "Released",
        className: "border-muted-foreground/30 text-muted-foreground",
    },
};

function NumberBillingSummary({ number }: { number: PhoneNumber }) {
    const status = number.billingStatus ?? "ACTIVE";
    const meta = BILLING_STATUS_META[status];
    const rentalPrice = formatRentalPrice(
        number.rentalPriceMicros ?? number.monthlyPriceMicros,
    );
    const atRisk =
        status === "SUSPENDED" ||
        status === "RELEASE_PENDING" ||
        status === "RELEASING";

    return (
        <div
            className={cn(
                "space-y-1.5 text-xs",
                atRisk && "border border-destructive/25 bg-destructive/5 p-3",
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={meta.className}>
                    {meta.label}
                </Badge>
                <span className="font-medium text-foreground">
                    {rentalPrice ? `${rentalPrice} / 30 days` : "Rental price pending"}
                </span>
            </div>
            {status === "ACTIVE" ? (
                <p className="flex items-center gap-1 text-muted-foreground">
                    <CalendarClock className="size-3" />
                    {number.nextBillingAt
                        ? `Renews ${formatDateTime(number.nextBillingAt)}`
                        : "Renewal date pending"}
                </p>
            ) : status === "RELEASED" ? (
                <p className="font-medium text-destructive">
                    This number has been released and cannot receive calls.
                </p>
            ) : (
                <>
                    <p className="font-medium text-destructive">
                        Calling is suspended. Add paid credit to keep this number.
                    </p>
                    <p className="text-muted-foreground">
                        {number.scheduledReleaseAt
                            ? `Scheduled for release ${formatDateTime(number.scheduledReleaseAt)}`
                            : "Release time pending"}
                    </p>
                </>
            )}
        </div>
    );
}

// ── provider chip ─────────────────────────────────────────────────────────────

const PROVIDER_META: Record<
    PhoneNumber["provider"],
    { label: string; cls: string }
> = {
    TWILIO:  { label: "TWILIO",  cls: "border-blue-500/20 bg-blue-500/10 text-blue-500" },
    TELNYX:  { label: "TELNYX",  cls: "border-cyan-500/20 bg-cyan-500/10 text-cyan-500" },
};

function ProviderChip({ provider }: { provider: PhoneNumber["provider"] }) {
    const meta = PROVIDER_META[provider] ?? { label: provider.toUpperCase(), cls: "border-muted bg-muted/30 text-muted-foreground" };
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
            meta.cls
        )}>
            <Signal className="size-3" />
            {meta.label}
        </span>
    );
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function NumbersPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
            </div>
            <div className="overflow-hidden border bg-card">
                <div className="border-b p-4">
                    <Skeleton className="h-5 w-40" />
                </div>
                <div className="divide-y">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="grid gap-3 p-4 sm:grid-cols-5">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-5 w-20" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function NumbersPage() {
    const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [providerFilter, setProviderFilter] = useState<"all" | PhoneNumber["provider"]>("all");
    const [routingFilter, setRoutingFilter] = useState<"all" | "assigned" | "unassigned">("all");
    const { data: numbers, isLoading, isError, isFetching, refetch } = useNumbers();
    const { data: activeMemberRole } = authClient.useActiveMemberRole();
    const canManageNumbers = isBuiltInNumberManager(activeMemberRole?.role);

    const assignedCount   = numbers?.filter((n) => n.agentId).length ?? 0;
    const unassignedCount = (numbers?.length ?? 0) - assignedCount;
    const atRiskNumbers =
        numbers?.filter(
            (number) =>
                number.billingStatus === "SUSPENDED" ||
                number.billingStatus === "RELEASE_PENDING" ||
                number.billingStatus === "RELEASING",
        ) ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredNumbers = useMemo(() => {
        const list = numbers ?? [];
        return list.filter((number) => {
            const matchesSearch = normalizedSearch
                ? [
                    number.number,
                    number.friendlyName,
                    number.provider,
                    number.sid,
                    number.billingStatus,
                ]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(normalizedSearch))
                : true;
            const matchesProvider = providerFilter === "all" || number.provider === providerFilter;
            const matchesRouting =
                routingFilter === "all" ||
                (routingFilter === "assigned" ? Boolean(number.agentId) : !number.agentId);

            return matchesSearch && matchesProvider && matchesRouting;
        });
    }, [normalizedSearch, numbers, providerFilter, routingFilter]);
    const hasActiveFilters = Boolean(normalizedSearch) || providerFilter !== "all" || routingFilter !== "all";

    function clearFilters() {
        setSearchTerm("");
        setProviderFilter("all");
        setRoutingFilter("all");
    }

    async function copyNumber(phoneNumber: string) {
        await navigator.clipboard.writeText(phoneNumber);
        setCopiedNumber(phoneNumber);
        setTimeout(() => setCopiedNumber(null), 2000);
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Phone numbers"
                description="Route owned numbers to agents and keep assignment coverage visible."
                actions={canManageNumbers ? <BuyNumberDrawer /> : undefined}
            />

            {isLoading ? (
                <NumbersPageSkeleton />
            ) : isError ? (
                <EmptyState
                    icon={Phone}
                    title="Could not load phone numbers"
                    description="Refresh the list or try again after checking your connection."
                    action={
                        <Button variant="outline" onClick={() => refetch()}>
                            <RefreshCw /> Retry
                        </Button>
                    }
                />
            ) : !numbers?.length ? (
                <EmptyState
                    icon={Phone}
                    title="No phone numbers yet"
                    description={canManageNumbers
                        ? "Buy a number from your telephony provider to start routing calls."
                        : "No phone numbers have been added to this organization."}
                    action={canManageNumbers ? <BuyNumberDrawer /> : undefined}
                />
            ) : (
                <>
                    {/* ── stat cards ── */}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {/* Total */}
                        <div className="rounded-lg border bg-card p-4 transition-all hover:border-blue-500/30 hover:shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-muted-foreground">Total numbers</p>
                                <Phone className="size-4 text-blue-500" />
                            </div>
                            <p className="mt-3 text-2xl font-semibold text-foreground">{numbers.length}</p>
                        </div>

                        {/* Assigned */}
                        <div className="rounded-lg border bg-card p-4 transition-all hover:border-blue-500/30 hover:shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-muted-foreground">Assigned</p>
                                <Route className="size-4 text-blue-500" />
                            </div>
                            <p className="mt-3 text-2xl font-semibold text-foreground">{assignedCount}</p>
                        </div>

                        {/* Needs routing — amber accent when > 0 */}
                        <div className={cn(
                            "rounded-lg border p-4 transition-all hover:shadow-sm",
                            unassignedCount > 0
                                ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                                : "border bg-card hover:border-blue-500/30"
                        )}>
                            <div className="flex items-center justify-between gap-3">
                                <p className={cn(
                                    "text-sm font-medium",
                                    unassignedCount > 0 ? "text-amber-400" : "text-muted-foreground"
                                )}>
                                    Needs routing
                                </p>
                                <AlertCircle className={cn(
                                    "size-4",
                                    unassignedCount > 0 ? "text-amber-400" : "text-blue-500"
                                )} />
                            </div>
                            <p className={cn(
                                "mt-3 text-2xl font-semibold",
                                unassignedCount > 0 ? "text-amber-400" : "text-foreground"
                            )}>
                                {unassignedCount}
                            </p>
                        </div>

                        <div className={cn(
                            "rounded-lg border p-4 transition-all hover:shadow-sm",
                            atRiskNumbers.length > 0
                                ? "border-destructive/30 bg-destructive/5"
                                : "bg-card hover:border-blue-500/30",
                        )}>
                            <div className="flex items-center justify-between gap-3">
                                <p className={cn(
                                    "text-sm font-medium",
                                    atRiskNumbers.length > 0
                                        ? "text-destructive"
                                        : "text-muted-foreground",
                                )}>
                                    At risk
                                </p>
                                <CalendarClock className={cn(
                                    "size-4",
                                    atRiskNumbers.length > 0
                                        ? "text-destructive"
                                        : "text-blue-500",
                                )} />
                            </div>
                            <p className={cn(
                                "mt-3 text-2xl font-semibold",
                                atRiskNumbers.length > 0
                                    ? "text-destructive"
                                    : "text-foreground",
                            )}>
                                {atRiskNumbers.length}
                            </p>
                        </div>
                    </div>

                    {atRiskNumbers.length > 0 ? (
                        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
                            <AlertCircle className="size-4 shrink-0 text-destructive" />
                            <span className="flex-1">
                                {atRiskNumbers.length} phone number{atRiskNumbers.length === 1 ? " is" : "s are"} suspended or pending release. Recharge paid credit before the shown release time or the number may be permanently lost.
                            </span>
                            <Link
                                href="/settings/billing"
                                className="shrink-0 font-medium text-destructive underline underline-offset-4"
                            >
                                Recharge wallet
                            </Link>
                        </div>
                    ) : null}

                    {/* ── routing warning banner ── */}
                    {canManageNumbers && unassignedCount > 0 && !bannerDismissed ? (
                        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                            <AlertCircle className="size-4 shrink-0" />
                            <span className="flex-1">
                                {unassignedCount} number{unassignedCount > 1 ? "s" : ""} need
                                routing — assign an agent to start receiving calls.
                            </span>
                            <button
                                onClick={() => setBannerDismissed(true)}
                                aria-label="Dismiss"
                                className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                    ) : null}

                    {/* ── search and filters ── */}
                    <section className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="flex size-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-500">
                                        <Filter className="size-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-semibold text-foreground">Find numbers</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Search by number, friendly name, provider, or SID and narrow by routing state.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Showing <span className="font-semibold text-foreground">{filteredNumbers.length}</span> of {numbers.length}
                            </div>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_190px_auto] lg:items-center">
                            <label className="relative block">
                                <span className="sr-only">Search phone numbers</span>
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Search number, name, provider, or SID"
                                    className="pl-9"
                                />
                            </label>
                            <Select value={providerFilter} onValueChange={(value) => setProviderFilter(value as typeof providerFilter)}>
                                <SelectTrigger className="w-full" aria-label="Filter by provider">
                                    <SelectValue placeholder="Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All providers</SelectItem>
                                    <SelectItem value="TWILIO">Twilio</SelectItem>
                                    <SelectItem value="TELNYX">Telnyx</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={routingFilter} onValueChange={(value) => setRoutingFilter(value as typeof routingFilter)}>
                                <SelectTrigger className="w-full" aria-label="Filter by routing state">
                                    <SelectValue placeholder="Routing" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All routing states</SelectItem>
                                    <SelectItem value="assigned">Assigned only</SelectItem>
                                    <SelectItem value="unassigned">Needs routing</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={clearFilters}
                                disabled={!hasActiveFilters}
                                className="w-full lg:w-auto"
                            >
                                Clear filters
                            </Button>
                        </div>
                    </section>

                    {/* ── routing table ── */}
                    <section className="overflow-hidden border bg-card">
                        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">Routing table</h2>
                                <p className="text-sm text-muted-foreground">
                                    {canManageNumbers
                                        ? "Assign each inbound number to the agent that should answer it."
                                        : "View which agent currently answers each inbound number."}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => refetch()}
                                disabled={isFetching}
                                className="w-full sm:w-auto"
                            >
                                <RefreshCw className={isFetching ? "animate-spin" : undefined} />
                                Refresh
                            </Button>
                        </div>

                        {filteredNumbers.length === 0 ? (
                            <EmptyState
                                icon={Search}
                                title="No numbers match these filters"
                                description="Clear filters or try a different number, provider, routing state, or SID."
                                className="m-4 bg-background/40"
                                action={
                                    <Button variant="outline" onClick={clearFilters} disabled={!hasActiveFilters}>
                                        Clear filters
                                    </Button>
                                }
                            />
                        ) : null}

                        <div className={cn("divide-y md:hidden", filteredNumbers.length === 0 && "hidden")}>
                            {filteredNumbers.map((number) => (
                                <div key={number.phId} className="space-y-4 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-blue-500">
                                            <Phone className="size-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <p className="truncate font-mono text-sm font-semibold text-foreground">
                                                    {number.number}
                                                </p>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={`Copy ${number.number}`}
                                                    onClick={() => copyNumber(number.number)}
                                                >
                                                    {copiedNumber === number.number ? (
                                                        <Check className="size-3.5 text-emerald-500" />
                                                    ) : (
                                                        <Copy className="size-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {number.friendlyName || "No friendly name"}
                                            </p>
                                        </div>
                                        <ProviderChip provider={number.provider} />
                                    </div>
                                    <NumberBillingSummary number={number} />
                                    <div>
                                        <p className="mb-2 text-xs font-medium text-muted-foreground">Routing</p>
                                        <AssignAgentSelect
                                            phId={number.phId}
                                            agentId={number.agentId}
                                            readOnly={!canManageNumbers}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                                        <div>
                                            <p>Created</p>
                                            <p className="mt-1 text-foreground">{formatDate(number.createdAt)}</p>
                                        </div>
                                        <div>
                                            <p>Modified</p>
                                            <p className="mt-1 text-foreground">{formatDate(number.updatedAt)}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p>SID</p>
                                            <p className="mt-1 truncate font-mono text-foreground">{number.sid}</p>
                                        </div>
                                    </div>
                                    {canManageNumbers &&
                                    number.billingStatus !== "RELEASING" &&
                                    number.billingStatus !== "RELEASED" ? (
                                        <ReleaseNumberDialog
                                            phId={number.phId}
                                            phoneNumber={number.number}
                                        />
                                    ) : null}
                                </div>
                            ))}
                        </div>

                        <div className={cn("hidden overflow-x-auto md:block", filteredNumbers.length === 0 && "md:hidden")}>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                                        <TableHead>Number</TableHead>
                                        <TableHead>Provider</TableHead>
                                        <TableHead>Billing</TableHead>
                                        <TableHead>Routing</TableHead>
                                        <TableHead>Timeline</TableHead>
                                        <TableHead>SID</TableHead>
                                        {canManageNumbers ? (
                                            <TableHead className="text-right">Actions</TableHead>
                                        ) : null}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredNumbers.map((number) => (
                                        <TableRow
                                            key={number.phId}
                                            className="transition-colors hover:bg-muted/10"
                                        >
                                            {/* number + copy */}
                                            <TableCell className="min-w-[220px]">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-blue-500">
                                                        <Phone className="size-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <p className="truncate font-mono text-sm font-semibold text-foreground">
                                                                {number.number}
                                                            </p>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                aria-label={`Copy ${number.number}`}
                                                                onClick={() => copyNumber(number.number)}
                                                            >
                                                                {copiedNumber === number.number ? (
                                                                    <Check className="size-3.5 text-emerald-500" />
                                                                ) : (
                                                                    <Copy className="size-3.5" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {number.friendlyName || "No friendly name"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            {/* provider chip */}
                                            <TableCell>
                                                <ProviderChip provider={number.provider} />
                                            </TableCell>

                                            {/* rental status and renewal */}
                                            <TableCell className="min-w-[260px]">
                                                <NumberBillingSummary number={number} />
                                            </TableCell>

                                            {/* routing select */}
                                            <TableCell className="min-w-[220px]">
                                                <AssignAgentSelect
                                                    phId={number.phId}
                                                    agentId={number.agentId}
                                                    readOnly={!canManageNumbers}
                                                />
                                            </TableCell>

                                            {/* timeline */}
                                            <TableCell className="whitespace-nowrap">
                                                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                                    <span>Created {formatDate(number.createdAt)}</span>
                                                    <span className="text-muted-foreground/60">
                                                        Modified {formatDate(number.updatedAt)}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* SID with tooltip */}
                                            <TableCell>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="inline-flex cursor-help items-center gap-1 font-mono text-xs text-muted-foreground">
                                                            <Hash className="size-3" />
                                                            {number.sid.slice(0, 10)}…
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="left" className="font-mono text-xs">
                                                        {number.sid}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TableCell>

                                            {canManageNumbers ? (
                                                <TableCell className="text-right">
                                                    {number.billingStatus !== "RELEASING" &&
                                                    number.billingStatus !== "RELEASED" ? (
                                                        <ReleaseNumberDialog
                                                            phId={number.phId}
                                                            phoneNumber={number.number}
                                                            compact
                                                        />
                                                    ) : null}
                                                </TableCell>
                                            ) : null}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
