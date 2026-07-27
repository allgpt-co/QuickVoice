export type RoadmapPhase = "P0" | "P1" | "P2";
export type RoadmapEpicArea = "flows" | "templates" | "campaigns" | "analytics" | "api_ecosystem" | "telephony" | "enterprise" | "platform_ux";

export type RoadmapChildIssue = {
  issue: number;
  title: string;
  phase: RoadmapPhase;
  requiredEvidence: string[];
};

export type RoadmapEpic = {
  issue: number;
  area: RoadmapEpicArea;
  title: string;
  childIssues: RoadmapChildIssue[];
};

export const QUICKVOICE_ROADMAP_ISSUE = 76;

export const QUICKVOICE_ROADMAP_EPICS: RoadmapEpic[] = [
  epic(77, "flows", "Visual orchestration, versions, and deployment", [86, 88, 92, 97, 101]),
  epic(78, "templates", "Templates, onboarding, and solution blueprints", [104, 107, 111, 114]),
  epic(79, "campaigns", "Customer data and campaigns", [117, 120, 123, 124]),
  epic(80, "analytics", "Analytics, conversation intelligence, evaluations, and experiments", [90, 93, 98, 100, 103, 105]),
  epic(81, "api_ecosystem", "API, MCP, integrations, and data portability", [108, 110, 113, 115, 118, 121]),
  epic(82, "telephony", "Telephony, channels, and runtime reliability", [94, 99, 102, 106]),
  epic(83, "enterprise", "Enterprise governance, security, privacy, and compliance", [109, 112, 116, 119, 122]),
  epic(84, "platform_ux", "Platform UX, collaboration, commercial operations, and ecosystem", [85, 87, 89, 91, 95]),
];

export const ROADMAP_CROSS_CUTTING_CONTROLS = [
  "organization_scoped_authorization",
  "idempotent_mutations",
  "draft_production_separation",
  "zero_pii_and_retention",
  "provider_cost_and_degraded_states",
  "keyboard_accessible_responsive_ui",
  "documented_api_event_contracts",
  "rollback_failure_tests",
] as const;

export function summarizeRoadmapCoverage(implementedIssueNumbers: number[]) {
  const implemented = new Set(implementedIssueNumbers);
  return QUICKVOICE_ROADMAP_EPICS.map((epic) => {
    const completed = epic.childIssues.filter((child) => implemented.has(child.issue)).map((child) => child.issue);
    const missing = epic.childIssues.filter((child) => !implemented.has(child.issue)).map((child) => child.issue);
    return {
      issue: epic.issue,
      area: epic.area,
      childCount: epic.childIssues.length,
      completed,
      missing,
      status: missing.length === 0 ? "covered" as const : completed.length > 0 ? "partial" as const : "not_started" as const,
    };
  });
}

export function findRoadmapEpicForChild(issueNumber: number) {
  return QUICKVOICE_ROADMAP_EPICS.find((epic) => epic.childIssues.some((child) => child.issue === issueNumber));
}

function epic(issue: number, area: RoadmapEpicArea, title: string, childIssues: number[]): RoadmapEpic {
  return {
    issue,
    area,
    title,
    childIssues: childIssues.map((childIssue) => ({
      issue: childIssue,
      title: `Issue #${childIssue}`,
      phase: childIssue <= 97 || [108, 117].includes(childIssue) ? "P0" : childIssue <= 120 ? "P1" : "P2",
      requiredEvidence: ["contract", "tests", "auth_or_policy_boundary", "backward_compatibility"],
    })),
  };
}
