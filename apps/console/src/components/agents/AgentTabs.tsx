"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AudioLines,
  BookOpen,
  Bot,
  Gauge,
  GitBranch,
  Settings,
  Webhook,
  Wrench,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { BehaviorTab } from "@/src/components/agents/tabs/BehaviorTab";
import { VoiceTab } from "@/src/components/agents/tabs/VoiceTab";
import { WebhooksTab } from "@/src/components/agents/tabs/WebhooksTab";
import { ToolsTab } from "@/src/components/agents/tabs/ToolsTab";
import { KnowledgeTab } from "@/src/components/agents/tabs/KnowledgeTab";
import { AdvancedTab } from "@/src/components/agents/tabs/AdvancedTab";
import { LimitsTab } from "@/src/components/agents/tabs/LimitsTab";
import { FlowTab } from "@/src/components/agents/tabs/FlowTab";

const TABS = [
  { id: "behavior", label: "Behavior", icon: Bot },
  { id: "voice", label: "Models & Voices", icon: AudioLines },
  { id: "flow", label: "Flow", icon: GitBranch },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "limits", label: "Limits", icon: Gauge },
  { id: "advanced", label: "Advanced", icon: Settings },
] as const;

type TabId = (typeof TABS)[number]["id"];

function normalizeTab(value: string | null): TabId {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : "behavior";
}

export function AgentTabs({ agentId }: { agentId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = normalizeTab(params.get("tab"));

  function onChange(value: string) {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={onChange} className="w-full min-w-0">
      <div className="border bg-card">
        <TabsList className="h-auto w-full justify-start overflow-x-auto border-b bg-transparent p-0">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-12 flex-none border-x-0 border-b-2 border-t-0 border-transparent bg-transparent px-4 text-xs font-semibold data-[state=active]:border-primary data-[state=active]:bg-muted/30 data-[state=active]:text-foreground data-[state=active]:shadow-none data-active:border-primary data-active:bg-muted/30 data-active:text-foreground data-active:shadow-none"
            >
              <tab.icon className="size-4" />
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="behavior" className="mt-6 min-w-0">
        <BehaviorTab agentId={agentId} />
      </TabsContent>
      <TabsContent value="voice" className="mt-6 min-w-0">
        <VoiceTab agentId={agentId} />
      </TabsContent>
      <TabsContent value="flow" className="mt-6 min-w-0">
        <FlowTab agentId={agentId} />
      </TabsContent>
      <TabsContent value="webhooks" className="mt-6 min-w-0">
        <WebhooksTab agentId={agentId} />
      </TabsContent>
      <TabsContent value="tools" className="mt-6 min-w-0">
        <ToolsTab agentId={agentId} />
      </TabsContent>
      <TabsContent value="knowledge" className="mt-6 min-w-0">
        <KnowledgeTab agentId={agentId} />
      </TabsContent>
      <TabsContent value="limits" className="mt-6 min-w-0">
        <LimitsTab />
      </TabsContent>
      <TabsContent value="advanced" className="mt-6 min-w-0">
        <AdvancedTab agentId={agentId} />
      </TabsContent>
    </Tabs>
  );
}
