import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  ownerAc,
  memberAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  agent: ["create", "read", "update", "delete"],
  agentConfiguration: ["create", "read", "update", "delete"],
  agentWidget: ["create", "read", "update", "delete"],
  phoneNumber: ["create", "read", "update", "delete"],
  knowledgeSource: ["create", "read", "update", "delete"],
  callLogs: ["read", "delete"],
  outboundCalls: ["create", "read", "delete"],
  campaigns: ["create", "read", "delete"],
  tools: ["create", "read", "update", "delete"],
  secrets: ["create", "read", "delete"],
} as const;

const ac = createAccessControl(statement);

// owner: everything on every custom resource + full default org permissions
const owner = ac.newRole({
  agent: ["create", "read", "update", "delete"],
  agentConfiguration: ["create", "read", "update", "delete"],
  agentWidget: ["create", "read", "update", "delete"],
  phoneNumber: ["create", "read", "update", "delete"],
  knowledgeSource: ["create", "read", "update", "delete"],
  callLogs: ["read", "delete"],
  outboundCalls: ["create", "read", "delete"],
  campaigns: ["create", "read", "delete"],
  tools: ["create", "read", "update", "delete"],
  secrets: ["create", "read", "delete"],
  ...ownerAc.statements,
});

// admin: full CRUD on custom resources, inherits default admin org permissions
const admin = ac.newRole({
  agent: ["create", "read", "update", "delete"],
  agentConfiguration: ["create", "read", "update", "delete"],
  agentWidget: ["create", "read", "update", "delete"],
  phoneNumber: ["create", "read", "update", "delete"],
  knowledgeSource: ["create", "read", "update", "delete"],
  callLogs: ["read", "delete"],
  outboundCalls: ["create", "read", "delete"],
  campaigns: ["create", "read", "delete"],
  tools: ["create", "read", "update", "delete"],
  secrets: ["create", "read", "delete"],
  ...adminAc.statements,
});

// member: read-mostly; can place outbound calls, cannot mutate config
const member = ac.newRole({
  agent: ["read"],
  agentConfiguration: ["read"],
  agentWidget: ["read"],
  phoneNumber: ["read"],
  knowledgeSource: ["read"],
  callLogs: ["read"],
  outboundCalls: ["create", "read"],
  campaigns: ["read"],
  tools: ["read"],
  secrets: ["read"],
  ...memberAc.statements,
});

const roles = { owner, admin, member };

export { ac, owner, admin, member, roles };
