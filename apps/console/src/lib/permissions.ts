// Mirror of the server's permission statement in apps/server/src/lib/permissions.ts.
// Used by the Roles settings page to build the permission matrix editor.
// Keep in sync with the server when new resources or actions are added.

export const RESOURCES = [
  { id: "agent", label: "Agents", actions: ["create", "read", "update", "delete"] },
  { id: "agentConfiguration", label: "Agent config", actions: ["create", "read", "update", "delete"] },
  { id: "phoneNumber", label: "Phone numbers", actions: ["create", "read", "update", "delete"] },
  { id: "knowledgeSource", label: "Knowledge base", actions: ["create", "read", "update", "delete"] },
  { id: "callLogs", label: "Call logs", actions: ["read", "delete"] },
  { id: "outboundCalls", label: "Outbound calls", actions: ["create", "read", "delete"] },
  { id: "campaigns", label: "Campaigns", actions: ["create", "read", "delete"] },
  { id: "tools", label: "Tools", actions: ["create", "read", "update", "delete"] },
  { id: "secrets", label: "Secrets", actions: ["create", "read", "delete"] },
] as const;

export type ResourceId = (typeof RESOURCES)[number]["id"];
export type Permissions = Partial<Record<ResourceId, string[]>>;

export const BUILTIN_ROLES = ["owner", "admin", "member"] as const;
