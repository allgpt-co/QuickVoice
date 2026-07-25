"use client";

import Link from "next/link";
import {
 ArrowRight,
 BookOpen,
 FileSpreadsheet,
 FileText,
 Link as LinkIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/src/components/common/EmptyState";
import { Button } from "@/src/components/ui/button";
import { KnowledgeSourceStatus } from "@/src/components/kb/kb-utils";
import { Skeleton } from "@/src/components/ui/skeleton";
import { kbApi } from "@/src/lib/api/resources/kb";
import { queryKeys } from "@/src/lib/query-keys";
import type { KbSourceType } from "@/src/lib/api/types";

const SOURCE_ICON: Record<KbSourceType, typeof FileText> = {
 PDF: FileText,
 TXT: FileText,
 DOCX: FileText,
 CSV: FileText,
 XLSX: FileSpreadsheet,
 XLS: FileSpreadsheet,
 URL: LinkIcon,
};

export function KnowledgeTab({ agentId }: { agentId: string }) {
 const { data: sources, isLoading } = useQuery({
 queryKey: queryKeys.kb.list(agentId),
 queryFn: () => kbApi.list(agentId),
 refetchInterval: (query) =>
 query.state.data?.some((source) => source.status === "PROCESSING")
 ? 2_000
 : false,
 });

 return (
 <div className="space-y-6">
 <section className="border bg-card p-6">
 <div className="mb-5 flex items-start justify-between gap-3">
 <div className="space-y-1">
 <h2 className="text-base font-semibold">Attached documents</h2>
 <p className="text-sm text-muted-foreground">
 When RAG is enabled in Advanced, the agent can cite these.
 </p>
 </div>
 <Button asChild variant="outline">
 <Link href="/kb">
 Open knowledge base <ArrowRight className="size-4" />
 </Link>
 </Button>
 </div>

 {isLoading ? (
 <div className="space-y-2">
 {[...Array(3)].map((_, i) => (
 <Skeleton key={i} className="h-14 w-full" />
 ))}
 </div>
 ) : !sources?.length ? (
 <EmptyState
 icon={BookOpen}
 title="No documents attached"
 description="Upload a document in the Knowledge Base and assign it to this agent."
 className="border-0"
 />
 ) : (
 <div className="divide-y">
 {sources.map((s) => {
 const Icon = SOURCE_ICON[s.sourceType] ?? FileText;
 return (
 <div
 key={s.kbId}
 className="flex flex-col items-start gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start"
 >
 <div className="flex size-9 items-center justify-center border bg-muted/30">
 <Icon className="size-4" />
 </div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-medium">{s.name}</p>
 <p className="truncate text-xs text-muted-foreground">
 {s.originalFileName ?? s.sourceType}
 </p>
 </div>
 <div className="min-w-0 shrink-0 sm:max-w-sm">
 <KnowledgeSourceStatus source={s} compact />
 </div>
 </div>
 );
 })}
 </div>
 )}
 </section>
 </div>
 );
}
