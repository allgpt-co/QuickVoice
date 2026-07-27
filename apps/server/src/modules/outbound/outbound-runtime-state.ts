export type OutboundRuntimeJobKind = "batch-import" | "batch-dispatch" | "call-dispatch";

const JOB_PREFIX: Record<OutboundRuntimeJobKind, string> = {
  "batch-import": "outbound-batch-import",
  "batch-dispatch": "outbound-batch-dispatch",
  "call-dispatch": "outbound-call-dispatch",
};

export function outboundRuntimeJobId(kind: OutboundRuntimeJobKind, id: string) {
  return `${JOB_PREFIX[kind]}-${normalizeRuntimeId(id)}`;
}

function normalizeRuntimeId(id: string) {
  const normalized = id.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!normalized) throw new Error("Runtime job id requires a non-empty identifier");
  return normalized;
}
