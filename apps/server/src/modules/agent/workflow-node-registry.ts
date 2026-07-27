export type WorkflowNodeCategory = "conversation" | "decision" | "tool" | "handoff" | "data" | "time" | "terminal";
export type WorkflowPortKind = "success" | "failure" | "timeout" | "cancelled" | "fallback" | "custom";
export type SideEffectRisk = "none" | "read" | "write" | "communication" | "destructive";

export type WorkflowNodeManifest = {
  type: string;
  version: number;
  category: WorkflowNodeCategory;
  label: string;
  description: string;
  configSchema: Record<string, "string" | "number" | "boolean" | "object" | "array">;
  ports: Array<{ name: string; kind: WorkflowPortKind; required: boolean }>;
  capabilities: string[];
  sideEffectRisk: SideEffectRisk;
  retry: { allowed: boolean; idempotencyRequired: boolean; maxAttempts: number };
  permissions: string[];
};

export const FIRST_PARTY_NODE_MANIFESTS: WorkflowNodeManifest[] = [
  manifest("conversation.subagent", "Conversation / subagent", "conversation", ["success", "failure", "timeout"], { prompt: "string", model: "string", turnLimit: "number" }, "none", []),
  manifest("decision.switch", "Deterministic switch", "decision", ["success", "failure", "fallback"], { expression: "string" }, "none", []),
  manifest("decision.llm_classify", "Bounded LLM decision", "decision", ["success", "failure", "fallback"], { labels: "array", prompt: "string" }, "none", []),
  manifest("tool.builtin", "Built-in tool", "tool", ["success", "failure", "timeout"], { toolId: "string", arguments: "object" }, "write", ["tools:read"]),
  manifest("tool.http", "HTTP tool", "tool", ["success", "failure", "timeout"], { toolId: "string", arguments: "object" }, "write", ["tools:read"]),
  manifest("tool.mcp", "MCP tool", "tool", ["success", "failure", "timeout"], { connectionId: "string", toolName: "string", arguments: "object" }, "write", ["tools:read"]),
  manifest("flow.subflow", "Reusable subflow", "conversation", ["success", "failure", "timeout"], { workflowVersionId: "string" }, "none", ["agents:read"]),
  manifest("handoff.human", "Human handoff", "handoff", ["success", "failure", "timeout", "cancelled"], { queueId: "string", summaryFields: "array" }, "communication", ["agents:update"]),
  manifest("data.set", "Set variable", "data", ["success", "failure"], { variables: "object" }, "none", []),
  manifest("data.extract", "Extract data", "data", ["success", "failure"], { schema: "object" }, "none", []),
  manifest("time.wait", "Wait / resume", "time", ["success", "timeout", "cancelled"], { durationSeconds: "number" }, "none", []),
  manifest("time.business_hours", "Business-hours gate", "time", ["success", "fallback"], { timezone: "string", schedule: "object" }, "none", []),
  manifest("terminal.success", "Terminal success", "terminal", [], { outcome: "string" }, "none", []),
  manifest("terminal.failure", "Terminal failure", "terminal", [], { reason: "string" }, "none", []),
  manifest("terminal.opted_out", "Terminal opted out", "terminal", [], { reason: "string" }, "none", []),
  manifest("terminal.voicemail", "Terminal voicemail", "terminal", [], { disposition: "string" }, "none", []),
];

export function findWorkflowNodeManifest(type: string, version = 1) {
  return FIRST_PARTY_NODE_MANIFESTS.find((node) => node.type === type && node.version === version);
}

export function validateWorkflowNodeInstance(args: { type: string; version: number; config: Record<string, unknown>; outgoingPorts: string[]; grantedPermissions: string[] }) {
  const issues: string[] = [];
  const manifest = findWorkflowNodeManifest(args.type, args.version);
  if (!manifest) return [`unknown workflow node ${args.type}@${args.version}`];
  for (const [key, expected] of Object.entries(manifest.configSchema)) {
    if (!(key in args.config)) issues.push(`${manifest.type}.${key} is required`);
    else if (!matchesType(args.config[key], expected)) issues.push(`${manifest.type}.${key} must be ${expected}`);
  }
  for (const port of manifest.ports.filter((port) => port.required)) {
    if (!args.outgoingPorts.includes(port.name)) issues.push(`${manifest.type} requires ${port.name} edge`);
  }
  for (const permission of manifest.permissions) {
    if (!args.grantedPermissions.includes(permission)) issues.push(`${manifest.type} requires ${permission}`);
  }
  if (manifest.retry.allowed && manifest.sideEffectRisk !== "none" && manifest.retry.idempotencyRequired === false) issues.push(`${manifest.type} side-effect retries require idempotency`);
  return issues;
}

export function validateWorkflowGraphInvariants(nodes: Array<{ id: string; type: string; version: number }>, edges: Array<{ from: string; fromPort: string; to: string }>) {
  const issues: string[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) issues.push(`edge starts from missing node ${edge.from}`);
    if (!nodeIds.has(edge.to)) issues.push(`edge points to missing node ${edge.to}`);
    const source = nodes.find((node) => node.id === edge.from);
    const manifest = source ? findWorkflowNodeManifest(source.type, source.version) : undefined;
    if (manifest && !manifest.ports.some((port) => port.name === edge.fromPort)) issues.push(`${source?.id} uses unknown port ${edge.fromPort}`);
  }
  return issues;
}

function manifest(type: string, label: string, category: WorkflowNodeCategory, portNames: string[], configSchema: WorkflowNodeManifest["configSchema"], sideEffectRisk: SideEffectRisk, permissions: string[]): WorkflowNodeManifest {
  return {
    type,
    version: 1,
    category,
    label,
    description: `${label} node`,
    configSchema,
    ports: portNames.map((name) => ({ name, kind: name as WorkflowPortKind, required: name !== "fallback" && name !== "cancelled" })),
    capabilities: [category],
    sideEffectRisk,
    retry: { allowed: category === "tool", idempotencyRequired: category === "tool", maxAttempts: category === "tool" ? 3 : 1 },
    permissions,
  };
}

function matchesType(value: unknown, expected: WorkflowNodeManifest["configSchema"][string]) {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return typeof value === expected;
}
