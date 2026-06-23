import type { ReactNode } from "react";

import { PageHeader } from "@/src/components/common/PageHeader";
import { Skeleton } from "@/src/components/ui/skeleton";

function LoadingRegion({
 label,
 children,
 className = "flex flex-col gap-6",
}: {
 label: string;
 children: ReactNode;
 className?: string;
}) {
 return (
 <div
 role="status"
 aria-label={label}
 aria-live="polite"
 aria-busy="true"
 aria-atomic="true"
 className={className}
 >
 <span className="sr-only">{label}</span>
 <div aria-hidden="true" className={className}>
 {children}
 </div>
 </div>
 );
}

function DashboardCardSkeleton({
 className = "",
 compact = false,
}: {
 className?: string;
 compact?: boolean;
}) {
 return (
 <div className={`border bg-card p-5 ${className}`}>
 <div className="flex items-start justify-between gap-4">
 <div className="space-y-2">
 <Skeleton className="h-3 w-28" />
 <Skeleton className={compact ? "h-6 w-16" : "h-8 w-24"} />
 </div>
 <Skeleton className="size-8" />
 </div>
 <div className="mt-5 space-y-2">
 <Skeleton className="h-3 w-full" />
 <Skeleton className="h-3 w-3/4" />
 </div>
 </div>
 );
}

export function PageSkeleton() {
 return (
 <div className="flex flex-col gap-6">
 <div className="flex items-end justify-between border-b pb-5">
 <div className="space-y-2">
 <Skeleton className="h-8 w-48" />
 <Skeleton className="h-4 w-64" />
 </div>
 <Skeleton className="h-9 w-32" />
 </div>
 <Skeleton className="h-40 w-full " />
 <Skeleton className="h-64 w-full " />
 </div>
 );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
 return (
 <div className="space-y-2">
 {[...Array(rows)].map((_, i) => (
 <Skeleton key={i} className="h-14 w-full" />
 ))}
 </div>
 );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
 return (
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {[...Array(count)].map((_, i) => (
 <Skeleton key={i} className="h-44 " />
 ))}
 </div>
 );
}

export function DashboardLoadingSkeleton() {
 return (
 <LoadingRegion label="Loading dashboard summary">
 <PageHeader
 title="Dashboard"
 description="A compact view of call volume, outcomes, routing, and agent performance."
 actions={
 <div aria-label="Dashboard date range" className="space-y-2 sm:w-56">
 <div className="grid grid-cols-3 gap-1 border bg-background p-1">
 <Skeleton className="h-8 w-full" />
 <Skeleton className="h-8 w-full" />
 <Skeleton className="h-8 w-full" />
 </div>
 <Skeleton className="ml-auto h-3 w-32" />
 </div>
 }
 />

 <div className="flex flex-col gap-3 border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
 <div className="space-y-2">
 <Skeleton className="h-4 w-40" />
 <Skeleton className="h-3 w-64 max-w-full" />
 </div>
 <Skeleton className="h-9 w-28" />
 </div>

 <section className="grid gap-4 border bg-card p-5 lg:grid-cols-[1fr_340px] lg:items-center">
 <div className="space-y-3">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Operations snapshot
 </p>
 <Skeleton className="h-7 w-72 max-w-full" />
 <Skeleton className="h-4 w-full max-w-2xl" />
 </div>
 <div className="grid grid-cols-3 border bg-background text-center">
 {["minutes", "exceptions", "agents"].map((label, index) => (
 <div
 key={label}
 className={index < 2 ? "border-r px-3 py-3" : "px-3 py-3"}
 >
 <Skeleton className="mx-auto h-6 w-10" />
 <p className="mt-2 text-xs text-muted-foreground">{label}</p>
 </div>
 ))}
 </div>
 </section>

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
 <DashboardCardSkeleton className="xl:col-span-3" />
 <DashboardCardSkeleton className="xl:col-span-2" />
 <DashboardCardSkeleton className="xl:col-span-2" />
 <DashboardCardSkeleton className="xl:col-span-2" />
 <div className="grid grid-cols-2 gap-4 xl:col-span-3">
 <DashboardCardSkeleton compact />
 <DashboardCardSkeleton compact />
 </div>
 </div>

 <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
 <section className="border bg-card xl:col-span-2">
 <div className="flex flex-col gap-4 border-b p-5 xl:flex-row xl:items-end xl:justify-between">
 <div className="space-y-2">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Traffic timeline
 </p>
 <Skeleton className="h-6 w-72 max-w-full" />
 <Skeleton className="h-4 w-full max-w-xl" />
 </div>
 <div className="grid grid-cols-3 border bg-background text-center sm:min-w-96">
 {["calls", "minutes", "peak"].map((label, index) => (
 <div
 key={label}
 className={index < 2 ? "border-r px-3 py-2" : "px-3 py-2"}
 >
 <Skeleton className="mx-auto h-4 w-8" />
 <p className="mt-1 text-xs text-muted-foreground">{label}</p>
 </div>
 ))}
 </div>
 </div>
 <Skeleton className="m-5 h-80 w-[calc(100%-2.5rem)]" />
 <div className="grid gap-2 px-5 pb-5 sm:grid-cols-3">
 <Skeleton className="h-4 w-full" />
 <Skeleton className="h-4 w-full" />
 <Skeleton className="h-4 w-full" />
 </div>
 </section>

 <section className="border bg-card">
 <div className="flex items-center justify-between border-b px-5 py-4">
 <div className="space-y-2">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Agent activity
 </p>
 <Skeleton className="h-5 w-28" />
 <Skeleton className="h-3 w-44" />
 </div>
 <Skeleton className="h-4 w-16" />
 </div>
 <div className="grid grid-cols-2 border-b bg-muted/20 text-xs">
 <div className="border-r px-5 py-3">
 <Skeleton className="h-4 w-8" />
 <p className="mt-1 text-muted-foreground">active agents</p>
 </div>
 <div className="px-5 py-3">
 <Skeleton className="h-4 w-8" />
 <p className="mt-1 text-muted-foreground">assigned calls</p>
 </div>
 </div>
 <div className="space-y-4 p-5">
 {Array.from({ length: 5 }).map((_, index) => (
 <div key={index} className="border bg-background p-3">
 <div className="flex items-start gap-3">
 <Skeleton className="size-8 shrink-0" />
 <div className="min-w-0 flex-1 space-y-3">
 <div className="flex justify-between gap-3">
 <div className="space-y-2">
 <Skeleton className="h-4 w-36" />
 <Skeleton className="h-3 w-44" />
 </div>
 <Skeleton className="h-8 w-14" />
 </div>
 <Skeleton className="h-2 w-full" />
 </div>
 </div>
 </div>
 ))}
 </div>
 </section>
 </div>

 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 {["Call outcomes", "Direction mix"].map((title) => (
 <section key={title} className="border bg-card p-5">
 <div className="mb-5 flex items-start justify-between gap-4">
 <div className="space-y-2">
 <Skeleton className="h-3 w-20" />
 <h3 className="text-base font-semibold text-foreground">{title}</h3>
 <Skeleton className="h-3 w-60 max-w-full" />
 </div>
 <Skeleton className="h-12 w-20" />
 </div>
 <Skeleton className="h-64 w-full" />
 </section>
 ))}
 </div>

 <section className="border bg-card">
 <div className="flex items-center justify-between border-b px-5 py-4">
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 Recent activity
 </p>
 <h3 className="mt-1 text-base font-semibold text-foreground">
 Recent call logs
 </h3>
 <p className="text-xs text-muted-foreground">
 Latest call log activity across all agents.
 </p>
 </div>
 <Skeleton className="h-4 w-24" />
 </div>
 <div className="space-y-2 p-5">
 {Array.from({ length: 6 }).map((_, index) => (
 <Skeleton key={index} className="h-14 w-full" />
 ))}
 </div>
 </section>
 </LoadingRegion>
 );
}
