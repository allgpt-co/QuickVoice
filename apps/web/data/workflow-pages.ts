export interface WorkflowPageContent {
  path: string;
  label: string;
  title: string;
  description: string;
  introduction: string;
  steps: { title: string; body: string }[];
  requirements: string[];
  checks: { scenario: string; expected: string }[];
  faqs: { question: string; answer: string }[];
  guides: { slug: string; title: string }[];
}

export const workflowPages: Record<string, WorkflowPageContent> = {
  receptionist: {
    path: "/solutions/ai-receptionist",
    label: "AI receptionist",
    title: "Give callers a clear next step",
    description:
      "Evaluate an AI receptionist for business FAQs, caller intake, and appointment requests, with clear human follow-up and implementation requirements.",
    introduction:
      "Start with the calls your front desk handles repeatedly. QuickVoice gives your implementation team an agent builder, business knowledge, phone connections, and call records to configure a focused receptionist workflow.",
    steps: [
      {
        title: "Answer routine questions",
        body: "Use approved business information for opening hours, service areas, directions, and preparation instructions. Ask a person to handle questions outside that material.",
      },
      {
        title: "Capture the request",
        body: "Collect the reason for calling and the minimum contact information needed for follow-up. Confirm the caller's details before ending the conversation.",
      },
      {
        title: "Define the next action",
        body: "Record a callback request or use a tested external tool. Booking, dispatch, and live transfers require an implemented connection and an available destination.",
      },
    ],
    requirements: [
      "An owner for business knowledge and scripts.",
      "A technical operator for hosting, credentials, telephony, and monitoring.",
      "A defined callback process when the requested action cannot be completed.",
    ],
    checks: [
      {
        scenario: "Caller asks about an unlisted service",
        expected:
          "Agent acknowledges the information gap and records a follow-up request.",
      },
      {
        scenario: "Caller changes a phone number",
        expected:
          "Agent repeats the corrected number and avoids retaining both as confirmed.",
      },
      {
        scenario: "Requested destination is unavailable",
        expected:
          "Caller receives an accurate fallback; the call is not described as transferred.",
      },
    ],
    faqs: [
      {
        question: "Can I use this after business hours?",
        answer:
          "You can configure and test an after-hours workflow. Availability depends on your deployment, providers, monitoring, and fallback process; it is not an uptime promise.",
      },
      {
        question: "Does it book directly into my calendar?",
        answer:
          "Calendar booking needs an authenticated tool or API connection implemented for your system. Confirm availability and the booking result before telling a caller an appointment is booked.",
      },
    ],
    guides: [
      {
        slug: "ai-phone-answering-service-small-business",
        title: "Evaluate phone answering for a small business",
      },
      {
        slug: "ai-appointment-scheduling-guide",
        title: "Plan an appointment workflow",
      },
    ],
  },
  answering: {
    path: "/solutions/ai-answering-service",
    label: "AI answering service",
    title: "Turn routine calls into useful follow-up",
    description:
      "Plan AI phone answering for FAQs, messages, and callback requests. Compare operating costs, human coverage, and setup requirements before a pilot.",
    introduction:
      "An answering workflow should leave the caller and your team with the same understanding of what happens next. Use QuickVoice to configure routine answers and intake, then evaluate the experience with your own calls.",
    steps: [
      {
        title: "Choose the call types",
        body: "Begin with a bounded set such as business information and callback requests. Keep urgent, sensitive, or discretionary decisions with your team.",
      },
      {
        title: "Connect business information",
        body: "Upload approved knowledge and configure the agent's instructions. External account, calendar, and order data need separately authorized tools.",
      },
      {
        title: "Close the loop",
        body: "Choose who reads call outcomes, how callback requests reach staff, and how failed deliveries are retried. Test that process before routing customer traffic.",
      },
    ],
    requirements: [
      "Documented opening hours, questions, and escalation contacts.",
      "LiveKit plus a configured Twilio or Telnyx account for real phone calls.",
      "A measured budget for providers, hosting, implementation, and staff follow-up.",
    ],
    checks: [
      {
        scenario: "Caller asks for a person",
        expected:
          "A tested transfer or callback process is offered without inventing staff availability.",
      },
      {
        scenario: "Background noise obscures a detail",
        expected: "The agent requests clarification instead of guessing.",
      },
      {
        scenario: "Knowledge does not cover the question",
        expected:
          "The agent records the question for a person rather than inventing a policy.",
      },
    ],
    faqs: [
      {
        question: "How does this compare with a staffed answering service?",
        answer:
          "Compare representative call quality, escalation coverage, full operating cost, and responsibility for outages. QuickVoice supplies configurable software; it does not supply a staffed call center.",
      },
      {
        question: "What should I include in the cost comparison?",
        answer:
          "Include telephony, speech and model usage, hosting, implementation, monitoring, phone numbers, and human follow-up. Use your own volumes and vendor quotes, and check the current pricing page for hosted-service charges.",
      },
    ],
    guides: [
      {
        slug: "ai-phone-answering-service-small-business",
        title: "Phone answering buyer guide",
      },
      {
        slug: "best-ai-voice-agent-platforms-2026",
        title: "Compare voice-agent platforms",
      },
    ],
  },
  scheduling: {
    path: "/use-cases/appointment-scheduling",
    label: "Appointment scheduling",
    title: "Make appointment requests easier to handle",
    description:
      "Design an AI appointment scheduling workflow with availability checks, explicit booking confirmation, reminders, and human fallback.",
    introduction:
      "Separate collecting a preferred time from making a confirmed reservation. QuickVoice can support appointment conversations; your implementation must connect the scheduling system and verify the result of each permitted action.",
    steps: [
      {
        title: "Understand the request",
        body: "Collect the service, location, time zone, and preferred time. Explain any restrictions and ask only for the information the appointment needs.",
      },
      {
        title: "Check and confirm",
        body: "Check availability through a tested scheduling connection. QuickVoice’s default live-tool safeguards restrict tools marked as writes, side effects, or requiring confirmation. Creating a reservation needs an explicitly implemented authorization path. Read back a verified booking result; otherwise record a request for staff.",
      },
      {
        title: "Plan changes and reminders",
        body: "Define authorized rescheduling and cancellation actions. Reminder campaigns need consent, contact eligibility, timing, and a way for callers to request help.",
      },
    ],
    requirements: [
      "A scheduling-system API or tool with scoped credentials.",
      "Rules for time zones, appointment duration, cancellations, and duplicate requests.",
      "A staff queue for requests that cannot be booked automatically.",
    ],
    checks: [
      {
        scenario: "Two callers request the same slot",
        expected:
          "The scheduling system arbitrates availability; no second confirmation is invented.",
      },
      {
        scenario: "Booking response times out",
        expected:
          "The workflow checks the result before retrying and avoids duplicate reservations.",
      },
      {
        scenario: "Caller gives an ambiguous date",
        expected:
          "The agent clarifies the date and time zone before proceeding.",
      },
    ],
    faqs: [
      {
        question: "Is a calendar connector included for every provider?",
        answer:
          "No. Verify the target calendar, authentication, supported actions, and error handling with your implementation team. A conversational prompt alone cannot create a reservation.",
      },
      {
        question: "Will reminders reduce missed appointments?",
        answer:
          "Evaluate that with your own baseline and pilot. Track delivery, confirmed responses, cancellations, and attendance using comparable periods; a reminder feature alone does not prove a reduction.",
      },
    ],
    guides: [
      {
        slug: "free-ai-appointment-scheduling-tools",
        title: "Understand free scheduling tools and their limits",
      },
      {
        slug: "ai-appointment-scheduling-guide",
        title: "Appointment scheduling guide",
      },
      {
        slug: "automated-appointment-reminders-guide",
        title: "Plan appointment reminders",
      },
    ],
  },
  support: {
    path: "/use-cases/customer-support",
    label: "Customer support",
    title: "Give routine support calls a defined path",
    description:
      "Evaluate AI phone support for knowledge-based answers, request intake, and authorized lookups, with clear escalation and privacy boundaries.",
    introduction:
      "Choose a small set of support questions your team can answer from approved information. QuickVoice combines agent instructions, knowledge retrieval, external tools, and call records so your team can evaluate that workflow.",
    steps: [
      {
        title: "Answer from approved sources",
        body: "Provide current return rules, troubleshooting steps, and service information. Assign an owner to correct outdated knowledge.",
      },
      {
        title: "Authorize live lookups",
        body: "An order or account lookup requires caller verification and a separately implemented tool. Return only the data needed for the caller's authorized request.",
      },
      {
        title: "Escalate unresolved cases",
        body: "Specify which requests need a person and how context reaches that person. A ticket is created only when the connected system confirms it.",
      },
    ],
    requirements: [
      "An approved knowledge base and policy owner.",
      "Authentication and access rules for account-specific information.",
      "A working staff handoff, ticket, or callback process.",
    ],
    checks: [
      {
        scenario: "Caller asks about another person's order",
        expected:
          "Account data remains unavailable until the required authorization succeeds.",
      },
      {
        scenario: "Two knowledge sources conflict",
        expected:
          "Agent flags uncertainty and routes the policy question for review.",
      },
      {
        scenario: "Caller disputes the proposed resolution",
        expected:
          "The workflow offers a human follow-up path and preserves relevant context.",
      },
    ],
    faqs: [
      {
        question: "Can QuickVoice issue refunds?",
        answer:
          "Only an explicitly implemented and authorized external action could do that. Start with request intake; keep financial exceptions and disputed decisions with designated staff.",
      },
      {
        question: "How should we evaluate support costs?",
        answer:
          "Measure total cost per resolved issue, repeat calls, escalations, and customer effort. Include integration, supervision, and human work alongside provider usage.",
      },
    ],
    guides: [
      {
        slug: "ai-voice-agents-reduce-customer-support-costs",
        title: "Evaluate support costs and resolution quality",
      },
      {
        slug: "ai-voice-agent-security-data-privacy",
        title: "Review voice-agent data privacy",
      },
    ],
  },
  sales: {
    path: "/use-cases/sales-lead-gen",
    label: "Sales qualification",
    title: "Capture the context your sales team needs",
    description:
      "Plan AI lead qualification and follow-up with defined questions, contact eligibility, human review, and clear integration requirements.",
    introduction:
      "Use a focused conversation to understand a prospect's request and preferred next step. QuickVoice provides inbound and outbound calling paths, configurable agent instructions, and call outcomes for a sales workflow your team owns.",
    steps: [
      {
        title: "Define useful questions",
        body: "Ask about the business need, implementation constraints, timing, and requested follow-up. Avoid collecting sensitive information unrelated to the inquiry.",
      },
      {
        title: "Control who is contacted",
        body: "Before any outbound campaign, define consent and contact eligibility, calling hours, opt-out handling, and the jurisdictions involved with the responsible owner.",
      },
      {
        title: "Pass qualified context to a person",
        body: "Connect your CRM or staff queue through a tested interface. Confirm a meeting only after the scheduling system returns success; otherwise record a request.",
      },
    ],
    requirements: [
      "An agreed qualification rubric and human owner.",
      "Verified contact eligibility and suppression handling before outbound calls.",
      "A tested CRM or follow-up connection; no assumed connector coverage.",
    ],
    checks: [
      {
        scenario: "Prospect requests no further calls",
        expected:
          "The configured suppression process prevents later campaign attempts.",
      },
      {
        scenario: "Prospect asks about an unsupported feature",
        expected:
          "The agent records the requirement without promising that the feature exists.",
      },
      {
        scenario: "CRM delivery fails",
        expected:
          "The request remains visible to staff and is not reported as delivered.",
      },
    ],
    faqs: [
      {
        question: "Does qualification mean a sale is likely?",
        answer:
          "Qualification records fit against your team's criteria. It does not establish intent to buy or promise conversion; compare downstream outcomes against a defined baseline.",
      },
      {
        question: "Can it call a purchased contact list?",
        answer:
          "A list's availability does not establish permission to call. Have the responsible owner determine lawful contact eligibility, required consent, suppression, and operating rules before loading a campaign.",
      },
    ],
    guides: [
      {
        slug: "ai-voice-agents-b2b-lead-qualification",
        title: "Design a useful B2B qualification workflow",
      },
      {
        slug: "build-ai-voice-agent-small-business",
        title: "Plan a small-business implementation",
      },
    ],
  },
  realEstate: {
    path: "/industries/real-estate",
    label: "Real estate and property management",
    title: "Organize leasing and tenant call intake",
    description:
      "Explore AI phone workflows for leasing questions, viewing requests, and maintenance intake, with staff escalation and property-system requirements.",
    introduction:
      "Property calls range from routine listing questions to situations that need immediate human judgment. Begin with bounded leasing or maintenance intake and make the next staff action explicit.",
    steps: [
      {
        title: "Provide listing information",
        body: "Answer from approved property information. Time-sensitive availability and pricing require a current source, and a listing answer is not an offer or reservation.",
      },
      {
        title: "Collect viewing requests",
        body: "Record the property, preferred time, and contact details. A confirmed appointment requires a tested calendar connection and a successful booking result.",
      },
      {
        title: "Route maintenance intake",
        body: "Capture the reported issue and property reference. Publish a separate emergency route and define escalation with staff; do not ask an agent to diagnose danger or authorize repairs.",
      },
    ],
    requirements: [
      "Current listing knowledge and a staff owner.",
      "Property-system credentials and verified tenant access for private records.",
      "Emergency instructions, callback coverage, and a tested maintenance delivery path.",
    ],
    checks: [
      {
        scenario: "Caller reports immediate danger",
        expected:
          "The approved emergency instructions take precedence over routine intake.",
      },
      {
        scenario: "Property availability is outdated",
        expected:
          "The agent asks staff to confirm instead of offering an unavailable unit.",
      },
      {
        scenario: "Caller requests a tenant's personal details",
        expected: "The agent does not disclose another person's records.",
      },
    ],
    faqs: [
      {
        question: "Does this replace the property management system?",
        answer:
          "No. Your existing system remains the source of record. QuickVoice supplies the phone-agent workflow; account lookups, work orders, and scheduling require verified connections.",
      },
      {
        question: "Can it decide applicant eligibility?",
        answer:
          "Keep eligibility, screening, accommodation requests, and disputed decisions with authorized staff under your organization's policies. This workflow is for information and intake.",
      },
    ],
    guides: [
      {
        slug: "ai-voice-agents-property-management",
        title: "Property management workflow guide",
      },
      {
        slug: "ai-phone-answering-service-small-business",
        title: "Evaluate a phone answering workflow",
      },
    ],
  },
};
