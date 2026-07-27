export type IdentityProviderProtocol = "saml" | "oidc";
export type IdentityProviderState = "draft" | "validated" | "pilot" | "optional" | "enforced" | "disabled";
export type DomainState = "pending" | "verified" | "conflict" | "released";

export type IdentityProviderConfig = {
  providerId: string;
  organizationId: string;
  protocol: IdentityProviderProtocol;
  state: IdentityProviderState;
  issuer: string;
  audience: string;
  redirectUrl: string;
  signedLoginTestAt?: string;
  domainVerified: boolean;
  recoveryAdminUserId?: string;
  activeKeyIds: string[];
};

export type ScimOperation = {
  operationId: string;
  organizationId: string;
  externalId: string;
  action: "create" | "patch" | "put" | "delete";
  idempotencyKey: string;
  groupIds?: string[];
  requestedRoleIds?: string[];
};

export type GroupRoleMapping = {
  idpGroupId: string;
  roleIds: string[];
  delegatedRoleIds: string[];
};

export type SessionPolicy = {
  absoluteMinutes: number;
  idleMinutes: number;
  maxConcurrentSessions: number;
  requireRecentAuthForHighRisk: boolean;
  breakGlassMaxMinutes: number;
};

const UNSAFE_IDP_URL = /^(http:\/\/|https:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.))/i;

export function validateSsoEnforcement(config: IdentityProviderConfig): string[] {
  const issues: string[] = [];
  if (!config.issuer.trim()) issues.push("issuer is required");
  if (!config.audience.trim()) issues.push("audience is required");
  if (UNSAFE_IDP_URL.test(config.issuer) || UNSAFE_IDP_URL.test(config.redirectUrl)) issues.push("identity provider URLs must not target private or insecure hosts");
  if (config.activeKeyIds.length === 0) issues.push("at least one signing/JWKS key is required");
  if (config.state === "enforced") {
    if (!config.signedLoginTestAt) issues.push("enforcement requires a successful signed login test");
    if (!config.domainVerified) issues.push("enforcement requires a verified domain");
    if (!config.recoveryAdminUserId) issues.push("enforcement requires a verified recovery admin");
  }
  return issues;
}

export function mapScimGroupsToRoles(operation: ScimOperation, mappings: GroupRoleMapping[]) {
  if (!operation.idempotencyKey.trim()) throw new Error("SCIM idempotencyKey is required");
  const requested = new Set(operation.requestedRoleIds ?? []);
  const allowed = new Set<string>();
  for (const mapping of mappings.filter((mapping) => operation.groupIds?.includes(mapping.idpGroupId))) {
    for (const roleId of mapping.roleIds) allowed.add(roleId);
    for (const roleId of mapping.delegatedRoleIds) allowed.add(roleId);
  }
  const granted = [...requested].filter((roleId) => allowed.has(roleId)).sort();
  const denied = [...requested].filter((roleId) => !allowed.has(roleId)).sort();
  return { externalId: operation.externalId, grantedRoleIds: granted, deniedRoleIds: denied, disabled: operation.action === "delete" };
}

export function validateSessionPolicy(policy: SessionPolicy): string[] {
  const issues: string[] = [];
  if (policy.absoluteMinutes < 15 || policy.absoluteMinutes > 1440) issues.push("absolute session duration must be between 15 and 1440 minutes");
  if (policy.idleMinutes < 5 || policy.idleMinutes > policy.absoluteMinutes) issues.push("idle session duration must be at least 5 minutes and no greater than absolute duration");
  if (policy.maxConcurrentSessions < 1 || policy.maxConcurrentSessions > 50) issues.push("max concurrent sessions must be between 1 and 50");
  if (policy.breakGlassMaxMinutes > 60) issues.push("break-glass sessions must be short lived");
  return issues;
}

export function buildDomainVerificationStatus(args: { domain: string; state: DomainState; proofMatches: boolean; claimedByCurrentOrg: boolean }) {
  if (args.state === "verified" && args.proofMatches && args.claimedByCurrentOrg) return { status: "verified" as const, safeMessage: "Domain is verified for this organization." };
  if (args.state === "conflict") return { status: "conflict" as const, safeMessage: "Domain ownership needs administrator review." };
  return { status: "pending" as const, safeMessage: "Add the DNS proof record and retry verification." };
}
