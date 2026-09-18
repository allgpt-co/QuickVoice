/** Editorial routes, not publication approvals. Related guides must pass the review gate. */
export const BLOG_JOURNEYS = {
  "free-ai-appointment-scheduling-tools": {
    title: "Need to handle appointment requests by phone?",
    description: "Review the phone workflow before adding a conversation layer. Keep calendar access, confirmed bookings, and staff follow-up separate in your evaluation.",
    href: "/use-cases/appointment-scheduling",
    label: "Explore appointment requests",
    contactLabel: "Discuss your scheduling workflow",
    relatedSlugs: ["ai-appointment-scheduling-guide", "online-appointment-scheduling-ai-voice", "automated-appointment-reminders-guide"],
  },
  "ai-appointment-scheduling-guide": {
    title: "Define your first appointment workflow.",
    description: "Bring the calendar your staff uses, the requests you want to handle, and the exceptions that need a person. Confirm the implementation scope before a pilot.",
    href: "/use-cases/appointment-scheduling",
    label: "Review the scheduling workflow",
    contactLabel: "Discuss appointment intake",
    relatedSlugs: ["free-ai-appointment-scheduling-tools", "automated-appointment-reminders-guide", "online-appointment-scheduling-ai-voice"],
  },
  "ai-voice-agent-vs-ivr": {
    title: "Evaluate one reception route before replacing the menu.",
    description: "Start with the caller's task, approved answers, and a tested staff fallback. Compare the existing route with a bounded phone-agent pilot.",
    href: "/solutions/ai-receptionist",
    label: "Explore AI receptionist workflows",
    contactLabel: "Discuss your current call flow",
    relatedSlugs: ["how-to-migrate-ivr-to-ai-voice-agents", "ai-phone-answering-service-small-business", "ai-vs-human-agents-cost-comparison"],
  },
  "multi-language-ai-voice-agents": {
    title: "Plan language support around a real customer task.",
    description: "Define the required languages, business terminology, and human fallback. Validate the selected configuration instead of assuming provider language lists establish support.",
    href: "/use-cases/customer-support",
    label: "Review customer support workflows",
    contactLabel: "Discuss language requirements",
    relatedSlugs: ["elevenlabs-vs-deepgram-voice-ai", "ai-phone-answering-service-small-business", "ai-appointment-scheduling-guide"],
  },
  "vapi-alternatives": {
    title: "Is application ownership the reason to change?",
    description: "Review QuickVoice's source, provider prerequisites, and operating responsibilities. Bring the Vapi workflow and integration requirements that your replacement must preserve.",
    href: "/open-source",
    label: "Evaluate the open-source stack",
    contactLabel: "Discuss your Vapi workflow",
    relatedSlugs: ["quickvoice-vs-vapi", "retell-ai-alternatives", "best-ai-voice-agent-platforms-2026"],
  },
  "retell-ai-alternatives": {
    title: "Evaluate the workflow you need to change.",
    description: "Inspect QuickVoice's application stack and setup boundaries, then discuss the call behavior, records, and staff processes a migration would need to preserve.",
    href: "/open-source",
    label: "Review the open-source platform",
    contactLabel: "Discuss your Retell workflow",
    relatedSlugs: ["vapi-alternatives", "best-ai-voice-agent-platforms-2026", "ai-voice-agent-security-data-privacy"],
  },
  "quickvoice-vs-vapi": {
    title: "Turn the comparison into a scoped evaluation.",
    description: "Bring one call, the receiving system, and a named implementation owner. Review the stack and agree which outcomes a pilot must demonstrate before changing live traffic.",
    href: "/open-source",
    label: "Review QuickVoice's implementation scope",
    contactLabel: "Discuss a QuickVoice evaluation",
    relatedSlugs: ["vapi-alternatives", "ai-voice-agent-security-data-privacy", "ai-vs-human-agents-cost-comparison"],
  },
  "ai-phone-answering-service-small-business": {
    title: "Start with the calls your team already receives.",
    description: "Map routine questions, message capture, and callback ownership before a pilot. Keep scheduling or account changes behind a verified implementation path.",
    href: "/solutions/ai-answering-service",
    label: "Explore AI answering workflows",
    contactLabel: "Discuss your answering needs",
    relatedSlugs: ["ai-after-hours-call-handling", "build-ai-voice-agent-small-business", "roi-replacing-receptionist-ai-voice-agent"],
  },
  "ai-voice-agents-property-management": {
    title: "Choose one leasing or tenant-intake workflow.",
    description: "Bring the property information, staff request queue, and escalation policy. Confirm system access and follow-up ownership before promising a completed work order or viewing.",
    href: "/industries/real-estate",
    label: "Explore property-management workflows",
    contactLabel: "Discuss your property call intake",
    relatedSlugs: ["ai-voice-agents-real-estate", "ai-appointment-scheduling-guide", "ai-after-hours-call-handling"],
  },
};

export function getBlogJourney(slug) {
  return Object.hasOwn(BLOG_JOURNEYS, slug) ? BLOG_JOURNEYS[slug] : null;
}
