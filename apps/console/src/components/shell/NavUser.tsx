"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
 BadgeCheck,
 ChevronsUpDown,
 CreditCard,
 KeyRound,
 LogOut,
 Monitor,
 Moon,
 Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import {
 Avatar,
 AvatarFallback,
 AvatarImage,
} from "@/src/components/ui/avatar";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuGroup,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuSub,
 DropdownMenuSubContent,
 DropdownMenuSubTrigger,
 DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
 SidebarMenu,
 SidebarMenuButton,
 SidebarMenuItem,
 useSidebar,
} from "@/src/components/ui/sidebar";
import { authClient } from "@/src/lib/auth-client";
import { clearIdentityCache } from "@/src/lib/query-cache";

export interface NavUserProps {
 name: string;
 email: string;
 image: string | null;
}

function initials(name: string) {
 return name
 .split(" ")
 .map((p) => p[0])
 .filter(Boolean)
 .slice(0, 2)
 .join("")
 .toUpperCase();
}

export function NavUser({ user }: { user: NavUserProps }) {
 const { isMobile } = useSidebar();
 const router = useRouter();
 const queryClient = useQueryClient();
 const { theme, setTheme } = useTheme();

 async function signOut() {
 await authClient.signOut({
 fetchOptions: {
 onSuccess: () => {
 clearIdentityCache(queryClient);
 toast.success("Signed out");
 router.push("/login");
 },
 },
 });
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
 <Avatar className="size-9 ">
 {user.image ? (
 <AvatarImage src={user.image} alt={user.name} />
 ) : null}
 <AvatarFallback className="bg-primary/15 text-primary ring-1 ring-primary/20">
 {initials(user.name)}
 </AvatarFallback>
 </Avatar>
 <div className="grid flex-1 text-left text-sm leading-tight">
 <span className="truncate font-semibold">{user.name}</span>
 <span className="truncate text-xs text-muted-foreground/80">
 {user.email}
 </span>
 </div>
 <ChevronsUpDown className="ml-auto size-4 text-muted-foreground/70 transition-transform data-[state=open]:rotate-180" />
 </SidebarMenuButton>
 </DropdownMenuTrigger>
 <DropdownMenuContent
 className="w-(--radix-dropdown-menu-trigger-width) min-w-56 "
 side={isMobile ? "bottom" : "right"}
 align="end"
 sideOffset={4}
 >
 <DropdownMenuLabel className="p-0 font-normal">
 <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
 <Avatar className="size-8 ">
 {user.image ? (
 <AvatarImage src={user.image} alt={user.name} />
 ) : null}
 <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary">
 {initials(user.name)}
 </AvatarFallback>
 </Avatar>
 <div className="grid flex-1 text-left text-sm leading-tight">
 <span className="truncate font-medium">{user.name}</span>
 <span className="truncate text-xs text-muted-foreground">
 {user.email}
 </span>
 </div>
 </div>
 </DropdownMenuLabel>
 <DropdownMenuSeparator />
 <DropdownMenuGroup>
 <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
 <BadgeCheck />
 Account
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => router.push("/settings/billing")}>
 <CreditCard />
 Billing
 </DropdownMenuItem>
 <DropdownMenuItem
 onClick={() => router.push("/settings/api-keys")}
 >
 <KeyRound />
 API keys
 </DropdownMenuItem>
 </DropdownMenuGroup>
 <DropdownMenuSeparator />
 <DropdownMenuSub>
 <DropdownMenuSubTrigger>
 {theme === "dark" ? (
 <Moon />
 ) : theme === "light" ? (
 <Sun />
 ) : (
 <Monitor />
 )}
 Theme
 </DropdownMenuSubTrigger>
 <DropdownMenuSubContent>
 <DropdownMenuItem onClick={() => setTheme("light")}>
 <Sun />
 Light
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => setTheme("dark")}>
 <Moon />
 Dark
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => setTheme("system")}>
 <Monitor />
 System
 </DropdownMenuItem>
 </DropdownMenuSubContent>
 </DropdownMenuSub>
 <DropdownMenuSeparator />
 <DropdownMenuItem onClick={signOut}>
 <LogOut />
 Sign out
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </SidebarMenuItem>
 </SidebarMenu>
 );
}
