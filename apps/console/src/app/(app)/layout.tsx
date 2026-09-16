import { cookies } from "next/headers";

import {
  SidebarInset,
  SidebarProvider,
} from "@/src/components/ui/sidebar";
import { AppSidebar } from "@/src/components/shell/AppSidebar";
import { Topbar } from "@/src/components/shell/Topbar";
import { PageActionsProvider } from "@/src/components/shell/PageActionsSlot";
import { LiveCallsDock } from "@/src/components/calls/LiveCallsDock";
import { requireSession } from "@/src/lib/server-session";
import { LiveCallsProvider } from "@/src/providers/live-calls-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarState !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        activeOrgId={session.activeOrganizationId}
        user={{
          name: session.userName,
          email: session.userEmail,
          image: session.userImage,
        }}
      />
      <SidebarInset>
        <PageActionsProvider>
          <LiveCallsProvider
            key={session.activeOrganizationId}
            organizationId={session.activeOrganizationId}
          >
            <Topbar />
            <div className="flex flex-1 flex-col gap-4 p-4 pb-24 lg:p-6 lg:pb-24">{children}</div>
            <LiveCallsDock organizationId={session.activeOrganizationId} />
          </LiveCallsProvider>
        </PageActionsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
