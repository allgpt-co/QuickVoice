"use client";

import * as React from "react";
import {
  LayoutDashboard,
  Bot,
  Phone,
  PhoneCall,
  PhoneOutgoing,
  BookOpen,
  Settings2,
  Wrench,
  KeyRound,
  Moon,
  Sun,
  FlaskConical,
} from "lucide-react";
import { useTheme } from "next-themes";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/src/components/ui/sidebar";
import { NavMain, type NavItem } from "@/src/components/shell/NavMain";
import { OrgSwitcher } from "@/src/components/shell/OrgSwitcher";
import { NavUser, type NavUserProps } from "@/src/components/shell/NavUser";
import { CONSOLE_LIFECYCLE_AREAS, type ConsoleLifecycleAreaId } from "@/src/lib/console-ia";

const operateNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Call logs", href: "/calls", icon: PhoneCall },
];

const buildNav: NavItem[] = [
  { title: "Agents", href: "/agents", icon: Bot },
  { title: "Knowledge base", href: "/kb", icon: BookOpen },
  { title: "Tools", href: "/tools", icon: Wrench },
  { title: "Secrets", href: "/secrets", icon: KeyRound },
];

const testNav: NavItem[] = [{ title: "Testing", href: "/testing", icon: FlaskConical }];

const deployNav: NavItem[] = [
  { title: "Phone numbers", href: "/numbers", icon: Phone },
  { title: "Outbound", href: "/outbound", icon: PhoneOutgoing },
];

const settingsNav: NavItem[] = [
  {
    title: "Settings",
    href: "/settings",
    icon: Settings2,
    items: [
      { title: "Profile", href: "/settings/profile" },
      { title: "Organization", href: "/settings/organization" },
      { title: "Billing", href: "/settings/billing" },
      { title: "API keys", href: "/settings/api-keys" },
      { title: "Roles", href: "/settings/roles" },
      { title: "Danger zone", href: "/settings/danger" },
    ],
  },
];

function areaLabel(area: ConsoleLifecycleAreaId) {
  return CONSOLE_LIFECYCLE_AREAS[area].title;
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          tooltip={`Switch to ${nextTheme} mode`}
          aria-label={`Switch to ${nextTheme} mode`}
          onClick={() => setTheme(nextTheme)}
          className="h-11 !bg-transparent px-3 text-[15px] font-medium text-muted-foreground shadow-none transition-colors hover:!bg-sidebar-accent/60 hover:text-sidebar-foreground [&_svg]:size-[18px] [&_svg]:text-muted-foreground hover:[&_svg]:text-sidebar-foreground"
        >
          <Icon />
          <span>Switch to {nextTheme} mode</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({
  activeOrgId,
  user,
  ...props
}: {
  activeOrgId: string;
  user: NavUserProps;
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border/60 p-3.5">
        <OrgSwitcher activeOrgId={activeOrgId} />
      </SidebarHeader>
      <SidebarContent className="gap-1 py-2.5">
        <NavMain label={areaLabel("operate")} items={operateNav} />
        <SidebarSeparator className="mx-5 bg-sidebar-border/50" />
        <NavMain label={areaLabel("build")} items={buildNav} />
        <SidebarSeparator className="mx-5 bg-sidebar-border/50" />
        <NavMain label={areaLabel("test")} items={testNav} />
        <SidebarSeparator className="mx-5 bg-sidebar-border/50" />
        <NavMain label={areaLabel("deploy")} items={deployNav} />
        <SidebarSeparator className="mx-5 bg-sidebar-border/50" />
        <NavMain label={areaLabel("improve")} items={settingsNav} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60 p-3.5">
        <ThemeToggle />
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
