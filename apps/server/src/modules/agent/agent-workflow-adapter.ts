import { createHash } from "node:crypto";

export const WORKFLOW_SCHEMA_VERSION = "quickvoice.workflow.v1";

export type LegacyAgentWorkflowDocument = {
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  workflowId: string;
  metadata: {
    source: "legacy-agent-config";
    agentId: string;
    digest: string;
  };
  entryNodeId: "start";
  nodes: Array<
    | { id: "start"; type: "conversation.start"; firstMessage: string }
    | { id: "agent"; type: "conversation.agent"; systemPrompt: string }
    | { id: "end"; type: "conversation.end" }
  >;
  edges: Array<{ id: string; from: string; to: string }>;
};

export function buildLegacyAgentWorkflowDocument(args: {
  agentId: string;
  firstMessage: string;
  systemPrompt: string;
}): LegacyAgentWorkflowDocument {
  const content = {
    agentId: args.agentId,
    firstMessage: args.firstMessage,
    systemPrompt: args.systemPrompt,
  };

  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    workflowId: `legacy-agent-${args.agentId}`,
    metadata: {
      source: "legacy-agent-config",
      agentId: args.agentId,
      digest: digestJson(content),
    },
    entryNodeId: "start",
    nodes: [
      { id: "start", type: "conversation.start", firstMessage: args.firstMessage },
      { id: "agent", type: "conversation.agent", systemPrompt: args.systemPrompt },
      { id: "end", type: "conversation.end" },
    ],
    edges: [
      { id: "start-to-agent", from: "start", to: "agent" },
      { id: "agent-to-end", from: "agent", to: "end" },
    ],
  };
}

function digestJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
