export type ConsoleLifecycleAreaId = "build" | "test" | "deploy" | "operate" | "improve";

export type ConsoleResourceType =
  | "agent"
  | "workflow"
  | "template"
  | "phone_number"
  | "campaign"
  | "call"
  | "contact"
  | "tool"
  | "knowledge_source"
  | "evaluation"
  | "integration"
  | "secret"
  | "setting";

export type ConsoleStateKind =
  | "draft"
  | "validating"
  | "ready"
  | "deployed"
  | "healthy"
  | "degraded"
  | "failed"
  | "stale"
  | "permission_denied";

export type ConsoleSearchActionKind = "navigate" | "review" | "export" | "start" | "stop" | "delete";

export type ConsoleSearchResult = {
  type: ConsoleResourceType;
  id: string;
  organizationId: string;
  environmentId?: string;
  title: string;
  status: ConsoleStateKind;
  matchedFields: string[];
  allowedActions: ConsoleSearchActionKind[];
  href: string;
  freshness?: {
    checkedAt: string;
    staleAfterSeconds: number;
  };
};

export const CONSOLE_LIFECYCLE_AREAS: Record<
  ConsoleLifecycleAreaId,
  {
    title: string;
    description: string;
    resourceTypes: ConsoleResourceType[];
  }
> = {
  build: {
    title: "Build",
    description: "Create agents, knowledge, secrets, and tools before traffic is routed.",
    resourceTypes: ["agent", "workflow", "template", "knowledge_source", "tool", "secret"],
  },
  test: {
    title: "Test",
    description: "Preview behavior, review calls, and track evaluation readiness before deployment.",
    resourceTypes: ["evaluation", "call", "agent", "workflow"],
  },
  deploy: {
    title: "Deploy",
    description: "Connect phone numbers, outbound campaigns, integrations, and provider routing.",
    resourceTypes: ["phone_number", "campaign", "integration", "contact"],
  },
  operate: {
    title: "Operate",
    description: "Monitor health, live traffic, incidents, and recent call outcomes.",
    resourceTypes: ["call", "campaign", "agent", "phone_number"],
  },
  improve: {
    title: "Improve",
    description: "Tune settings, review access, export evidence, and harden the workspace.",
    resourceTypes: ["setting", "evaluation", "tool", "secret"],
  },
};

export const CONSOLE_STATE_LABELS: Record<ConsoleStateKind, string> = {
  draft: "Draft",
  validating: "Validating",
  ready: "Ready",
  deployed: "Deployed",
  healthy: "Healthy",
  degraded: "Needs attention",
  failed: "Failed",
  stale: "Stale",
  permission_denied: "Access required",
};

export const CONFIRMATION_REQUIRED_ACTIONS = new Set<ConsoleSearchActionKind>([
  "start",
  "stop",
  "delete",
]);

export function actionRequiresReview(action: ConsoleSearchActionKind) {
  return CONFIRMATION_REQUIRED_ACTIONS.has(action);
}
