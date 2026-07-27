import { createHash } from "node:crypto";

export type ComponentHealthState =
  | "configured"
  | "reachable"
  | "authorized"
  | "healthy"
  | "degraded"
  | "rate_limited"
  | "not_configured"
  | "unknown_stale";

export type ComponentHealth = {
  component: string;
  state: ComponentHealthState;
  impact: "none" | "feature_unavailable" | "platform_degraded";
  checkedAt: Date;
  staleAfterSeconds: number;
  remediation?: string;
  source: string;
};

export type SupportBundleFile = {
  path: string;
  content: string;
};

const REDACTION_PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/(authorization\s*[:=]\s*)[^\s,}]+/gi, "$1[redacted]"],
  [/(api[-_]?key\s*[:=]\s*)[^\s,}]+/gi, "$1[redacted]"],
  [/(secret\s*[:=]\s*)[^\s,}]+/gi, "$1[redacted]"],
  [/https?:\/\/[^\s]+X-Amz-Signature=[^\s]+/gi, "[redacted signed url]"],
  [/\+?\d[\d .()\-]{7,}\d/g, "[redacted phone]"],
  [/(transcript|prompt|toolPayload)\s*[:=]\s*"[^"]*"/gi, "$1: [redacted content]"],
];

export function classifyReadinessCheck({
  component,
  status,
  message,
  checkedAt = new Date(),
  staleAfterSeconds = 60,
  optional = false,
}: {
  component: string;
  status: "ok" | "error" | "not_configured";
  message?: string;
  checkedAt?: Date;
  staleAfterSeconds?: number;
  optional?: boolean;
}): ComponentHealth {
  if (status === "ok") {
    return { component, state: "healthy", impact: "none", checkedAt, staleAfterSeconds, source: "readiness" };
  }
  if (status === "not_configured") {
    return {
      component,
      state: "not_configured",
      impact: optional ? "none" : "feature_unavailable",
      checkedAt,
      staleAfterSeconds,
      remediation: message,
      source: "readiness",
    };
  }
  return {
    component,
    state: message?.toLowerCase().includes("rate") ? "rate_limited" : "degraded",
    impact: optional ? "feature_unavailable" : "platform_degraded",
    checkedAt,
    staleAfterSeconds,
    remediation: message,
    source: "readiness",
  };
}

export function redactSupportBundleContent(content: string) {
  return REDACTION_PATTERNS.reduce((redacted, [pattern, replacement]) => redacted.replace(pattern, replacement), content);
}

export function buildSupportBundleManifest({
  files,
  expiresAt,
}: {
  files: SupportBundleFile[];
  expiresAt: Date;
}) {
  const entries = files.map((file) => {
    const redactedContent = redactSupportBundleContent(file.content);
    return {
      path: file.path,
      bytes: Buffer.byteLength(redactedContent, "utf8"),
      sha256: createHash("sha256").update(redactedContent).digest("hex"),
      redacted: redactedContent !== file.content,
    };
  });

  return {
    expiresAt: expiresAt.toISOString(),
    files: entries,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}
