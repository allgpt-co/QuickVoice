export type TranscriptSearchMode = "keyword" | "semantic";
export type DerivedSignalKind = "summary" | "intent" | "topic" | "objection" | "entity" | "next_action" | "sentiment";
export type DerivedSignalStatus = "pending" | "ready" | "reviewed_correct" | "reviewed_incorrect" | "reviewed_uncertain" | "failed";

export type TranscriptSearchQuery = {
  organizationId: string;
  mode: TranscriptSearchMode;
  text?: string;
  phrases: string[];
  excludes: string[];
  filters: {
    from?: string;
    to?: string;
    agentId?: string;
    campaignId?: string;
    direction?: "inbound" | "outbound";
    language?: string;
    outcome?: string;
    topicId?: string;
    sentiment?: "positive" | "neutral" | "negative" | "unknown";
    evaluationResult?: string;
  };
  cursor?: string;
  limit: number;
};

export type DerivedSignal = {
  signalId: string;
  organizationId: string;
  callId: string;
  kind: DerivedSignalKind;
  value: string;
  confidence: number;
  modelVersion: string;
  promptVersion: string;
  processingMs: number;
  sourceTurns: { turnId: string; startMs: number; endMs: number }[];
  status: DerivedSignalStatus;
};

const CONTENT_REDACTIONS: [RegExp, string][] = [
  [/\+?\d[\d .()\-]{7,}\d/g, "[redacted phone]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]"],
  [/(api[-_]?key|secret|token|password)\s*[:=]\s*[^\s,}]+/gi, "$1=[redacted]"],
];

export function normalizeTranscriptSearchQuery(args: Omit<TranscriptSearchQuery, "phrases" | "excludes" | "limit"> & {
  phrases?: string[];
  excludes?: string[];
  limit?: number;
}): TranscriptSearchQuery {
  const text = args.text?.trim();
  if (args.mode === "keyword" && !text && !args.phrases?.length) {
    throw new Error("keyword search requires text or phrase filters");
  }

  return {
    ...args,
    text,
    phrases: [...new Set(args.phrases ?? [])].map((phrase) => phrase.trim()).filter(Boolean),
    excludes: [...new Set(args.excludes ?? [])].map((exclude) => exclude.trim()).filter(Boolean),
    limit: Math.min(Math.max(args.limit ?? 25, 1), 100),
  };
}

export function redactSearchSnippet(snippet: string) {
  return CONTENT_REDACTIONS.reduce((redacted, [pattern, replacement]) => redacted.replace(pattern, replacement), snippet);
}

export function buildDerivedSignal(signal: DerivedSignal): DerivedSignal {
  if (signal.confidence < 0 || signal.confidence > 1) throw new Error("signal confidence must be between 0 and 1");
  if (!signal.modelVersion.trim()) throw new Error("derived signal modelVersion is required");
  if (!signal.promptVersion.trim()) throw new Error("derived signal promptVersion is required");
  if (signal.sourceTurns.length === 0) throw new Error("derived signal must cite source turns");
  return signal;
}
