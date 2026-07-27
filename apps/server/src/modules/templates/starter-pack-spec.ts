export type StarterPackStatus = "reviewed" | "planned" | "blocked" | "deprecated";
export type StarterPackRiskLevel = "low" | "medium" | "high";

export type StarterPackSpec = {
  packId: string;
  title: string;
  status: StarterPackStatus;
  targetPersona: string;
  businessSize: "solo" | "smb" | "mid_market" | "enterprise";
  industries: string[];
  useCases: string[];
  channels: string[];
  locales: string[];
  prerequisites: string[];
  requiredInputs: string[];
  placeholders: string[];
  extractedFields: string[];
  evalRubric: string[];
  syntheticFixtureIds: string[];
  transferFallbacks: string[];
  dashboardRecommendations: string[];
  complianceWarnings: string[];
  capabilities: string[];
  owner: string;
  review: { content: boolean; conversationDesign: boolean; securityPrivacy: boolean; accessibility: boolean; domainRisk: boolean; nextReviewAt: string };
  riskLevel: StarterPackRiskLevel;
};

const FORBIDDEN_PACK_TEXT = /diagnose|legal advice|investment advice|guaranteed|real customer|real patient|production credential|api[_ -]?key|password|secret/i;

export const CURATED_STARTER_PACK_ROADMAP: StarterPackSpec[] = [
  reviewedPack("healthcare_dental_scheduling", "Healthcare and dental scheduling/intake", ["healthcare", "dental"], ["appointment_scheduling", "intake"], "high"),
  plannedPack("legal_intake", "Legal intake", ["legal"], ["intake", "scheduling"], "high"),
  plannedPack("home_services_dispatch", "Home services dispatch and lead qualification", ["home_services"], ["dispatch", "lead_qualification"], "medium"),
  plannedPack("real_estate_property", "Real estate and property management triage", ["real_estate", "property_management"], ["inquiry", "maintenance_triage"], "medium"),
  plannedPack("insurance_finance_inquiry", "Insurance and financial-services inquiry", ["insurance", "financial_services"], ["qualification", "handoff"], "high"),
  plannedPack("automotive_sales_service", "Automotive sales and service scheduling", ["automotive"], ["sales", "service_scheduling"], "medium"),
  plannedPack("restaurant_hospitality", "Restaurants and hospitality reservations", ["restaurants", "hospitality"], ["reservations", "guest_services"], "low"),
  plannedPack("ecommerce_returns", "E-commerce order support and returns", ["ecommerce"], ["order_status", "returns"], "medium"),
  plannedPack("logistics_exception_intake", "Logistics shipment status and exception intake", ["logistics"], ["shipment_status", "exception_intake"], "medium"),
  plannedPack("recruiting_screening", "Recruiting screening and scheduling", ["recruiting"], ["screening", "scheduling"], "high"),
  plannedPack("saas_support_onboarding", "SaaS support and onboarding", ["saas"], ["support", "onboarding"], "low"),
  plannedPack("horizontal_receptionist", "Horizontal receptionist", ["horizontal"], ["receptionist", "after_hours_routing"], "low"),
  plannedPack("horizontal_appointment_booking", "Horizontal appointment booking", ["horizontal"], ["appointment_booking"], "low"),
  plannedPack("horizontal_lead_qualification", "Horizontal lead qualification", ["horizontal"], ["lead_qualification"], "medium"),
  plannedPack("horizontal_customer_support", "Horizontal customer support", ["horizontal"], ["customer_support"], "low"),
  plannedPack("horizontal_collections_reminder", "Horizontal collections/payment reminder", ["horizontal"], ["collections", "payment_reminder"], "high"),
  plannedPack("horizontal_survey_nps", "Horizontal survey/NPS", ["horizontal"], ["survey", "nps"], "low"),
  plannedPack("horizontal_callback", "Horizontal callback", ["horizontal"], ["callback"], "low"),
  plannedPack("horizontal_after_hours", "Horizontal after-hours routing", ["horizontal"], ["after_hours_routing"], "low"),
];

export function validateStarterPackSpec(pack: StarterPackSpec): string[] {
  const issues: string[] = [];
  const requiredTextFields = [pack.packId, pack.title, pack.targetPersona, pack.owner];
  if (requiredTextFields.some((field) => !field.trim())) issues.push("pack identity fields are required");
  for (const [name, values] of Object.entries({ industries: pack.industries, useCases: pack.useCases, channels: pack.channels, locales: pack.locales, prerequisites: pack.prerequisites, requiredInputs: pack.requiredInputs, placeholders: pack.placeholders, extractedFields: pack.extractedFields, evalRubric: pack.evalRubric, syntheticFixtureIds: pack.syntheticFixtureIds, transferFallbacks: pack.transferFallbacks, dashboardRecommendations: pack.dashboardRecommendations, complianceWarnings: pack.complianceWarnings, capabilities: pack.capabilities })) {
    if (values.length === 0) issues.push(`${name} must not be empty`);
  }
  if (!pack.syntheticFixtureIds.every((fixtureId) => fixtureId.startsWith("synthetic_"))) issues.push("fixtures must be explicitly synthetic");
  if (pack.status === "reviewed" && Object.entries(pack.review).some(([key, value]) => key !== "nextReviewAt" && value !== true)) issues.push("reviewed packs require all review approvals");
  if (new Date(pack.review.nextReviewAt).toString() === "Invalid Date") issues.push("next review date is invalid");
  if (FORBIDDEN_PACK_TEXT.test(JSON.stringify(pack))) issues.push("pack contains forbidden claim or sensitive data pattern");
  return issues;
}

export function summarizeStarterPackCoverage(packs: StarterPackSpec[]) {
  const reviewed = packs.filter((pack) => pack.status === "reviewed").length;
  const planned = packs.filter((pack) => pack.status === "planned").length;
  const blocked = packs.filter((pack) => pack.status === "blocked").length;
  return { total: packs.length, reviewed, planned, blocked, allCategoriesAccountedFor: packs.length >= 19 };
}

function reviewedPack(packId: string, title: string, industries: string[], useCases: string[], riskLevel: StarterPackRiskLevel): StarterPackSpec {
  return {
    ...basePack(packId, title, industries, useCases, riskLevel),
    status: "reviewed",
    review: { content: true, conversationDesign: true, securityPrivacy: true, accessibility: true, domainRisk: true, nextReviewAt: "2026-12-31" },
  };
}

function plannedPack(packId: string, title: string, industries: string[], useCases: string[], riskLevel: StarterPackRiskLevel): StarterPackSpec {
  return { ...basePack(packId, title, industries, useCases, riskLevel), status: "planned" };
}

function basePack(packId: string, title: string, industries: string[], useCases: string[], riskLevel: StarterPackRiskLevel): StarterPackSpec {
  return {
    packId,
    title,
    status: "planned",
    targetPersona: "SMB owner or operations lead",
    businessSize: "smb",
    industries,
    useCases,
    channels: ["phone", "web_widget"],
    locales: ["en-US"],
    prerequisites: ["business profile", "hours", "handoff destination", "provider capability check"],
    requiredInputs: ["business_name", "hours", "location", "escalation_destination", "disclosure_copy"],
    placeholders: ["{{business_name}}", "{{hours}}", "{{location}}", "{{escalation_destination}}", "{{disclosure_copy}}"],
    extractedFields: ["caller_intent", "caller_name", "callback_number", "next_step"],
    evalRubric: ["collects required details", "does not overpromise", "uses escalation boundary", "confirms next step"],
    syntheticFixtureIds: [`synthetic_${packId}_happy_path`, `synthetic_${packId}_escalation`],
    transferFallbacks: ["human_handoff", "callback", "after_hours_message"],
    dashboardRecommendations: ["completion_rate", "handoff_rate", "missed_or_failed_calls"],
    complianceWarnings: ["Review disclosures, consent, retention, and regulated-domain boundaries before production use."],
    capabilities: ["agent_prompt", "workflow", "knowledge_placeholders", "evals", "handoff_policy"],
    owner: "QuickVoice Templates",
    review: { content: false, conversationDesign: false, securityPrivacy: false, accessibility: false, domainRisk: false, nextReviewAt: "2026-12-31" },
    riskLevel,
  };
}
