"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, Plus, ArrowRight, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/src/lib/auth-client";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { clearIdentityCache } from "@/src/lib/query-cache";

export default function Orgs() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: organizations, isPending } = authClient.useListOrganizations();
    const { data: session } = authClient.useSession();
    const activeOrgId = session?.session?.activeOrganizationId ?? null;

    const [pendingId, setPendingId] = useState<string | null>(null);
    const autoSelected = useRef(false);

    async function selectOrg(orgId: string) {
        setPendingId(orgId);
        const { error } = await authClient.organization.setActive({
            organizationId: orgId,
        });
        if (error) {
            toast.error(error.message || "Could not select organization");
            setPendingId(null);
            return;
        }
        clearIdentityCache(queryClient);
        router.replace("/dashboard");
    }

    // If the user has exactly one workspace and none is active, auto-pick it so
    // they skip the picker on first login. If they already have an active org
    // we still show the picker — they can be on this page deliberately (e.g.
    // clicked "Manage organizations" in the sidebar).
    useEffect(() => {
        if (autoSelected.current) return;
        if (!organizations) return;
        if (!activeOrgId && organizations.length === 1) {
            autoSelected.current = true;
            selectOrg(organizations[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizations, activeOrgId]);

    if (isPending || !organizations) {
        return (
            <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
                <Skeleton className="h-10 w-48" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-40 " />
                    ))}
                </div>
            </div>
        );
    }

    // Empty state — no orgs yet.
    if (organizations.length === 0) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6">
                <div className="w-full max-w-md border bg-card p-8 text-center">
                    <div className="mx-auto mb-5 flex size-14 items-center justify-center bg-gradient-to-br from-primary/30 to-primary/5 text-primary">
                        <Building2 className="size-7" />
                    </div>
                    <h1 className="text-xl font-semibold">Create your first workspace</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Workspaces keep your agents, numbers, and call logs separate from
                        anyone else&apos;s.
                    </p>
                    <div className="mt-6">
                        <Button asChild size="lg">
                            <Link href="/orgs/create">
                                <Plus /> Create workspace
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Picker — multiple orgs, user needs to pick one.
    return (
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-12">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Pick a workspace
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Choose which workspace to open. You can switch later from the
                        sidebar.
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/orgs/create">
                        <Plus /> New workspace
                    </Link>
                </Button>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {organizations.map((org) => {
                    const isActive = org.id === activeOrgId;
                    const isLoading = pendingId === org.id;
                    return (
                        <button
                            key={org.id}
                            type="button"
                            onClick={() => selectOrg(org.id)}
                            disabled={!!pendingId}
                            className="group relative flex flex-col gap-4 overflow-hidden border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-md disabled:opacity-60"
                        >
                            <div
                                aria-hidden
                                className="pointer-events-none absolute -right-8 -top-8 size-28 bg-gradient-to-br from-primary/20 to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
                            />
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex size-10 items-center justify-center bg-gradient-to-br from-primary/30 to-primary/5 text-primary">
                                    <Building2 className="size-5" />
                                </div>
                                {isActive ? (
                                    <span className="inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                                        <Check className="size-3" /> Current
                                    </span>
                                ) : null}
                            </div>
                            <div className="min-w-0 space-y-1">
                                <p className="truncate font-semibold text-foreground">
                                    {org.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    @{org.slug}
                                </p>
                            </div>
                            <div className="mt-auto flex items-center justify-end text-xs font-medium text-primary">
                                {isLoading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <>
                                        Open <ArrowRight className="ml-1 size-3" />
                                    </>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
