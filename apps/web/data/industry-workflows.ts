import type { WorkflowPageContent } from "./workflow-pages";

export const industryWorkflows: Record<string, WorkflowPageContent> = {
  "hr-recruiting": {
    path: "/industries/hr-recruiting",
    label: "HR and recruiting phone workflows",
    title: "Give candidates a clear next step",
    description:
      "Plan candidate enquiries, interview availability and HR callback requests with approved information, human decisions and tested system connections.",
    introduction:
      "Start with administrative calls: explain a published role, collect interview availability or record a question for HR. Configure QuickVoice with approved information and a staff follow-up process. Keep candidate evaluation and employment decisions with accountable people.",
    steps: [
      {
        title: "Define the information callers need",
        body: "Use the current job description, interview instructions and approved policy answers. Avoid guessing about pay, benefits, eligibility or application status.",
      },
      {
        title: "Collect an administrative request",
        body: "Ask for the minimum details needed to arrange a callback or discuss interview availability. Offer a human alternative for sensitive questions or accessibility needs.",
      },
      {
        title: "Confirm the staff handoff",
        body: "An applicant-tracking or calendar update requires an implemented, permitted action path. The default live MCP bridge restricts tools marked as writes or side effects; a candidate's request does not enable them.",
      },
    ],
    requirements: [
      "An HR owner for scripts, candidate communication and human review.",
      "A technical owner to implement any applicant-system or calendar connection and test its permissions.",
      "An agreed data-minimization, retention and access policy for candidate information.",
    ],
    checks: [
      {
        scenario: "Candidate requests an accommodation",
        expected:
          "The workflow offers the approved human contact and does not decide whether the accommodation is justified.",
      },
      {
        scenario: "Candidate asks whether they passed screening",
        expected:
          "An authorized status source or recruiter provides the answer; the agent does not infer a hiring decision from the conversation.",
      },
      {
        scenario: "Interview slot cannot be written",
        expected:
          "Record availability as a request and identify who will confirm it. Do not announce a booked interview.",
      },
    ],
    faqs: [
      {
        question: "Does a structured call establish fair hiring?",
        answer:
          "No. A script or transcript does not establish fairness, job relevance or legal compliance. Keep evaluation with responsible reviewers and assess the actual process, including accessibility and the effects of any automated criteria.",
      },
      {
        question: "Are HR and applicant-system connectors included?",
        answer:
          "Do not assume a named connector is available. Verify the target system's API, authentication, data fields and permitted actions with your implementation team before a pilot.",
      },
    ],
    guides: [
      {
        slug: "ai-appointment-scheduling-guide",
        title: "Plan request intake and scheduling",
      },
      {
        slug: "ai-voice-agent-security-data-privacy",
        title: "Review data and access responsibilities",
      },
    ],
  },
  saas: {
    path: "/industries/saas",
    label: "SaaS customer phone workflows",
    title: "Connect account questions with the right owner",
    description:
      "Evaluate SaaS onboarding enquiries, support intake and renewal callbacks with verified account information and clear implementation responsibilities.",
    introduction:
      "Use a bounded phone workflow to collect setup questions, point callers to approved documentation and arrange a conversation with support or customer success. Measure whether the next step was completed before drawing conclusions about retention or support cost.",
    steps: [
      {
        title: "Scope the customer question",
        body: "Separate general product guidance from private account information. Identify and authorize a caller before retrieving tenant-specific details.",
      },
      {
        title: "Use an approved information source",
        body: "Configure business knowledge from maintained documentation. Product analytics, support tickets and customer records need separately implemented connections and access checks.",
      },
      {
        title: "Route the next action",
        body: "Record a support or renewal callback with an owner. Ticket changes, account changes and calendar writes need a permitted action path; the default live MCP bridge restricts marked write and side-effect tools.",
      },
    ],
    requirements: [
      "A support owner for current documentation, escalation criteria and callbacks.",
      "Verified tenant and account authorization in every external data request.",
      "An engineering owner for event triggers, consent/eligibility rules, provider configuration and failed-action handling.",
    ],
    checks: [
      {
        scenario: "Caller asks about another account",
        expected:
          "No account data is disclosed without a verified authorization path.",
      },
      {
        scenario: "Documentation does not cover the error",
        expected:
          "Collect the reported issue and route it to support without inventing a diagnosis or fix.",
      },
      {
        scenario: "Customer asks to change a subscription",
        expected:
          "Only an implemented and verified business action can change the account; otherwise record a request for the account owner.",
      },
    ],
    faqs: [
      {
        question: "Will this improve retention?",
        answer:
          "Retention is an outcome to measure in your own cohort. Compare completed follow-ups, customer feedback and operating cost against a defined baseline; this page reports no customer gains.",
      },
      {
        question:
          "Does the repository establish a certification or data-processing agreement?",
        answer:
          "No. Source code and privacy controls do not establish a completed external audit, contractual commitment or deployment-wide guarantee. Verify the actual hosting, processors, access controls and agreements required for your use.",
      },
    ],
    guides: [
      {
        slug: "ai-voice-agents-reduce-customer-support-costs",
        title: "Estimate the work around a support call",
      },
      {
        slug: "ai-voice-agent-security-data-privacy",
        title: "Review the data flow",
      },
    ],
  },
  automotive: {
    path: "/industries/automotive",
    label: "Automotive phone workflows",
    title: "Organize service and test-drive requests",
    description:
      "Plan dealership phone intake for service enquiries, test-drive requests and staff callbacks, with verified vehicle information and scheduling boundaries.",
    introduction:
      "Define which calls belong with service, sales or the parts desk. QuickVoice can support a configured intake workflow using approved information; dealership records, appointment systems and follow-up actions need an implementation owner and a verified connection.",
    steps: [
      {
        title: "Clarify the reason for calling",
        body: "Distinguish a service request, test-drive enquiry and a vehicle question. Collect only the details your team needs and route safety concerns to the approved staff process.",
      },
      {
        title: "Check the relevant source",
        body: "Vehicle stock, repair status and service availability should come from an authorized, current source. A caller's phone number alone does not establish identity or permission to disclose a record.",
      },
      {
        title: "Confirm the outcome",
        body: "Record a preferred time as a request until the dealership system confirms it. Booking needs a separately implemented permitted action path; the default live MCP bridge restricts marked write and side-effect tools.",
      },
    ],
    requirements: [
      "A dealership owner for approved service/sales information and escalation contacts.",
      "A tested dealer-system or scheduling API connection with scoped credentials, if needed.",
      "An outreach owner for eligibility, timing, consent and requests to stop follow-up.",
    ],
    checks: [
      {
        scenario: "Vehicle availability has changed",
        expected:
          "Use a current authorized source or arrange a salesperson's callback; do not promise a vehicle is in stock.",
      },
      {
        scenario: "A booking request times out",
        expected:
          "Check the destination before any retry, avoid duplicate reservations and clearly state when confirmation is pending.",
      },
      {
        scenario: "Caller asks for a trade-in value or finance approval",
        expected:
          "Route to the responsible staff member without inventing an appraisal, rate or approval.",
      },
    ],
    faqs: [
      {
        question: "Is my dealership-management system supported?",
        answer:
          "Verify its available APIs, permissions and allowed actions with your implementation team. This page does not promise a prebuilt connector to a named vendor.",
      },
      {
        question: "How should a dealership judge a pilot?",
        answer:
          "Track accurate request capture, confirmed appointments, duplicate actions, staff follow-up and total operating cost. Use your own baseline; no sales, no-show or cost improvement is promised.",
      },
    ],
    guides: [
      {
        slug: "ai-appointment-scheduling-guide",
        title: "Plan a verified scheduling workflow",
      },
      {
        slug: "automated-appointment-reminders-guide",
        title: "Test appointment follow-up",
      },
    ],
  },
};
