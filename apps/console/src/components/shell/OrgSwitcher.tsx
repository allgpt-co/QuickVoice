"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronsUpDown, Plus, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
 SidebarMenu,
 SidebarMenuButton,
 SidebarMenuItem,
 useSidebar,
} from "@/src/components/ui/sidebar";
import { Skeleton } from "@/src/components/ui/skeleton";
import { authClient } from "@/src/lib/auth-client";
import { clearIdentityCache } from "@/src/lib/query-cache";

export function OrgSwitcher({ activeOrgId }: { activeOrgId: string }) {
 const { isMobile } = useSidebar();
 const router = useRouter();
 const queryClient = useQueryClient();
 const { data: organizations, isPending } = authClient.useListOrganizations();

 const active = organizations?.find((o) => o.id === activeOrgId);

 async function switchTo(orgId: string) {
 if (orgId === activeOrgId) return;
 const { error } = await authClient.organization.setActive({
 organizationId: orgId,
 });
 if (error) {
 toast.error(error.message || "Could not switch organization");
 return;
 }
 clearIdentityCache(queryClient);
 router.refresh();
 }

 return (
 <SidebarMenu>
 <SidebarMenuItem>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <SidebarMenuButton
 size="lg"
 className="h-14 border border-sidebar-border/70 !bg-transparent px-3 shadow-none transition-colors hover:!bg-sidebar-accent/60 hover:text-sidebar-foreground data-[state=open]:!bg-sidebar-accent/70 data-[state=open]:text-sidebar-foreground"
 >
 <div className="flex aspect-square size-9 items-center justify-center bg-primary/15 text-primary ring-1 ring-primary/20">
 {active?.logo ? (
 <Image
 src={active.logo}
 alt={active.name}
 width={24}
 height={24}
 unoptimized
 className="size-6 "
 />
 ) : (
 <Building2 className="size-[18px]" />
 )}
 </div>
 <div className="grid flex-1 text-left text-sm leading-tight">
 {active ? (
 <>
 <span className="truncate font-semibold">{active.name}</span>
 <span className="truncate text-xs text-muted-foreground/80">
 @{active.slug}
 </span>
 </>
 ) : (
 <>
 <Skeleton className="h-3.5 w-24" />
 <Skeleton className="mt-1 h-2.5 w-16" />
 </>
 )}
 </div>
 <ChevronsUpDown className="ml-auto size-4 text-muted-foreground/70 transition-transform data-[state=open]:rotate-180" />
 </SidebarMenuButton>
 </DropdownMenuTrigger>
 <DropdownMenuContent
 className="w-(--radix-dropdown-menu-trigger-width) min-w-64 "
 align="start"
 side={isMobile ? "bottom" : "right"}
 sideOffset={4}
 >
 <DropdownMenuLabel className="text-xs text-muted-foreground">
 Organizations
 </DropdownMenuLabel>
 {isPending ? (
 <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
 <Loader2 className="size-3.5 animate-spin" />
 Loading…
 </div>
 ) : (
 (organizations ?? []).map((org) => {
 const isActive = org.id === activeOrgId;
 return (
 <DropdownMenuItem
 key={org.id}
 onClick={() => switchTo(org.id)}
 className="gap-2 p-2"
 >
 <div className="flex size-6 items-center justify-center border bg-muted/40">
 <Building2 className="size-3.5" />
 </div>
 <div className="flex-1 truncate">{org.name}</div>
 {isActive ? (
 <Check className="size-4 text-primary" />
 ) : null}
 </DropdownMenuItem>
 );
 })
 )}
 <DropdownMenuSeparator />
 <DropdownMenuItem
 className="gap-2 p-2"
 onClick={() => router.push("/orgs/create")}
 >
 <div className="flex size-6 items-center justify-center border bg-transparent">
 <Plus className="size-4" />
 </div>
 <div className="font-medium text-muted-foreground">
 New organization
 </div>
 </DropdownMenuItem>
 <DropdownMenuItem
 className="gap-2 p-2"
 onClick={() => router.push("/orgs")}
 >
 <div className="flex size-6 items-center justify-center border bg-transparent">
 <Building2 className="size-3.5" />
 </div>
 <div className="font-medium text-muted-foreground">
 Manage organizations
 </div>
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </SidebarMenuItem>
 </SidebarMenu>
 );
}
