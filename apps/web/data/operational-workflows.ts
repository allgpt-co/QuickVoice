import type { WorkflowPageContent } from "./workflow-pages";

export const operationalWorkflows: Record<string, WorkflowPageContent> = {
  "e-commerce": {
    path: "/industries/e-commerce",
    label: "E-commerce phone workflows",
    title: "Help shoppers get a reliable next step",
    description:
      "Plan product questions, order enquiries and returns intake using maintained policies, authorized order access and a staff exception process.",
    introduction:
      "Begin with the questions your support team can answer from approved product and policy information. Keep private order lookups and transactional changes behind tested authorization and system connections.",
    steps: [
      {
        title: "Separate policy from private data",
        body: "Answer general product, shipping and return-policy questions from maintained information. An order reference alone is not sufficient authority to disclose customer information.",
      },
      {
        title: "Use the current order source",
        body: "Implement an authorized lookup for the fields a shopper needs. Preserve the source timestamp and distinguish an estimated delivery from a confirmed carrier event.",
      },
      {
        title: "Record or confirm the next step",
        body: "Capture a return question for support until a permitted action has confirmed eligibility and acceptance. Do not invent a refund, return label, discount or stock availability. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "A support owner for product information, return policies and escalation decisions.",
      "An engineering owner for order-system access, identity checks and provider configuration.",
      "An approved follow-up and retention policy for shopper contact details.",
    ],
    checks: [
      {
        scenario: "Order lookup is unavailable",
        expected:
          "State that the status is unavailable and arrange the approved follow-up; do not infer that the parcel shipped.",
      },
      {
        scenario: "Return is outside published policy",
        expected:
          "Record the circumstances for a person who can decide exceptions.",
      },
      {
        scenario: "Customer asks for a refund",
        expected:
          "Confirm only a verified refund result from the permitted action path.",
      },
    ],
    faqs: [
      {
        question: "Is a store or returns connector included?",
        answer:
          "Verify the target platform API, scoped permissions and supported operations with your implementation team. This page establishes no named prebuilt commerce connector.",
      },
      {
        question: "How should a retailer measure a pilot?",
        answer:
          "Track accurate answers, completed requests, duplicate or failed actions, human follow-up and full operating cost against your own baseline. There is no promised sales or support-cost gain.",
      },
    ],
    guides: [
      {
        slug: "ai-voice-agents-reduce-customer-support-costs",
        title: "Evaluate support work and cost",
      },
      {
        slug: "ai-phone-answering-service-small-business",
        title: "Plan a business answering workflow",
      },
    ],
  },
  education: {
    path: "/industries/education",
    label: "Education phone workflows",
    title: "Give students and families a clear contact path",
    description:
      "Plan admissions enquiries, campus information and administrative callbacks with approved institutional information and protected student records.",
    introduction:
      "Start with public programme information and administrative request intake. Student records, guardian authority, admissions decisions and financial-aid questions need distinct permissions and responsible staff.",
    steps: [
      {
        title: "Define the audience and question",
        body: "Use current programme dates, office contacts and approved admissions instructions. Distinguish a prospective-student enquiry from a request for a protected student record.",
      },
      {
        title: "Collect only approved details",
        body: "Ask for the minimum information needed for staff follow-up. Implement identity and guardian-authority checks before any student-specific disclosure.",
      },
      {
        title: "Hand decisions to the institution",
        body: "Record counselling or campus-visit availability as a request until confirmed. Staff decide admissions, financial aid, accommodations and safeguarding responses. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "An institutional owner for information accuracy, accessibility and staff referrals.",
      "A privacy owner to approve audience, records, retention, notices and any child or guardian interactions.",
      "A technical owner to verify each student-system or calendar connection before real records are used.",
    ],
    checks: [
      {
        scenario: "A parent asks for a student record",
        expected:
          "Apply the institution-approved authorization process and disclose nothing while authority is unresolved.",
      },
      {
        scenario: "Caller asks whether aid has been awarded",
        expected:
          "Refer to the financial-aid team; do not invent eligibility or an award.",
      },
      {
        scenario: "A safety concern is raised",
        expected:
          "Use the institution-approved immediate human route. This workflow is not an emergency notification system.",
      },
    ],
    faqs: [
      {
        question: "Does this page establish education privacy compliance?",
        answer:
          "No. The institution must review the actual data, audience, providers, contracts and workflow with its qualified privacy and legal owners before deployment.",
      },
      {
        question: "Can the agent update enrolment or book a visit?",
        answer:
          "Only through an implemented, authorized action with a verified result. Otherwise it can collect a request for staff confirmation.",
      },
    ],
    guides: [
      {
        slug: "ai-appointment-scheduling-guide",
        title: "Plan verified scheduling",
      },
      {
        slug: "ai-voice-agent-security-data-privacy",
        title: "Review data and access responsibilities",
      },
    ],
  },
  logistics: {
    path: "/industries/logistics",
    label: "Logistics phone workflows",
    title: "Keep shipment enquiries connected to current information",
    description:
      "Plan shipment status enquiries, delivery preferences and exception callbacks with authorized tracking data and accountable operations staff.",
    introduction:
      "A shipment enquiry needs a current source and a clear owner when plans change. Use a bounded phone workflow to explain verified status or collect a delivery request; keep dispatch and transport decisions with the responsible operations process.",
    steps: [
      {
        title: "Identify the shipment and authority",
        body: "Define the identity checks and minimum references needed for a shipment lookup. Limit address, contact and cargo information to what the caller is authorized to receive.",
      },
      {
        title: "Read the source accurately",
        body: "Implement access to the relevant tracking system. Read timestamps and distinguish carrier estimates from confirmed events; do not calculate a new arrival time without an approved source.",
      },
      {
        title: "Route delivery changes and exceptions",
        body: "Record a preferred window, failed delivery or damage report for the operations owner. A schedule or address change needs verified system acceptance. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "An operations owner for delivery exceptions, disputes and staff follow-up.",
      "A tested tracking-system connection with scoped access and a defined stale-data rule.",
      "A communication policy that accounts for recipient eligibility and safe contact with drivers.",
    ],
    checks: [
      {
        scenario: "Tracking information is old",
        expected:
          "State the last verified status and arrange follow-up without presenting it as live location.",
      },
      {
        scenario: "Recipient requests a new delivery address",
        expected:
          "Use the approved verification and permitted action process; do not promise rerouting.",
      },
      {
        scenario: "Driver cannot safely respond",
        expected:
          "Follow the operator-approved contact procedure; avoid workflows that depend on an immediate driving-time response.",
      },
    ],
    faqs: [
      {
        question: "Are transport and warehouse systems connected by default?",
        answer:
          "No connection to a named system is established by this guide. Verify the actual API, credentials, fields and permitted actions before a pilot.",
      },
      {
        question: "Can this replace dispatch or safety systems?",
        answer:
          "Treat it as a bounded enquiry or request workflow. Dispatch, hazardous-goods, safety and regulatory decisions need the responsible operational systems and people.",
      },
    ],
    guides: [
      {
        slug: "ai-phone-answering-service-small-business",
        title: "Plan a business answering workflow",
      },
      {
        slug: "ai-voice-agents-reduce-customer-support-costs",
        title: "Evaluate support work and cost",
      },
    ],
  },
  "manufacturing-engineering": {
    path: "/industries/manufacturing-engineering",
    label: "Manufacturing phone workflows",
    title: "Make supplier and maintenance requests easier to follow",
    description:
      "Plan supplier confirmations, maintenance requests and shift-availability intake with source records, human decisions and explicit action boundaries.",
    introduction:
      "Use a phone workflow for routine communication around a production operation: collect a supplier response, record maintenance availability or route an order question. Equipment control, quality release and safety response remain in the approved operational process.",
    steps: [
      {
        title: "Choose one administrative task",
        body: "Define the purchase-order, asset or shift reference the team needs. Use approved information and avoid disclosing technical documents outside the authorized audience.",
      },
      {
        title: "Capture the response accurately",
        body: "Separate a supplier statement from a confirmed change in the purchasing system. Read back quantities or dates where appropriate and keep unresolved discrepancies visible.",
      },
      {
        title: "Confirm the responsible owner",
        body: "Route maintenance, quality and staffing exceptions to an identified person. Do not announce a changed order, work assignment or machine status without the destination confirming it. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "An operations owner for supplier, maintenance or staffing policy and escalation.",
      "A technical owner for any ERP or maintenance-system connection and data permissions.",
      "A tested human route for safety, product quality and confidential engineering information.",
    ],
    checks: [
      {
        scenario: "Supplier disputes a quantity",
        expected:
          "Capture the discrepancy and route to purchasing without changing the order autonomously.",
      },
      {
        scenario: "A maintenance request includes a hazard",
        expected:
          "Use the approved safety contact; do not provide improvised equipment instructions.",
      },
      {
        scenario: "An employee accepts a shift",
        expected:
          "Keep availability distinct from an authorized roster assignment.",
      },
    ],
    faqs: [
      {
        question: "Does the workflow establish quality or safety compliance?",
        answer:
          "No. A conversation or call record does not establish a certified quality system, compliant electronic record or safety process. The relevant owners must evaluate the complete deployment.",
      },
      {
        question: "Can it connect to our production systems?",
        answer:
          "An implementation team must verify each API and permitted operation. This guide does not establish a prebuilt ERP, MES, maintenance or sensor connector.",
      },
    ],
    guides: [
      {
        slug: "build-ai-voice-agent-small-business",
        title: "Prepare the implementation",
      },
      {
        slug: "ai-voice-agent-security-data-privacy",
        title: "Review data and access responsibilities",
      },
    ],
  },
  "travel-hospitality": {
    path: "/industries/travel-hospitality",
    label: "Travel and hospitality phone workflows",
    title: "Give guest requests a clear route to staff",
    description:
      "Plan guest enquiries, reservation requests and disruption callbacks with current booking information, provider review and human escalation.",
    introduction:
      "Begin with approved property or trip information and a request for the relevant staff team. Availability, prices, reservations and disruption options depend on the actual booking system and the authority granted to the workflow.",
    steps: [
      {
        title: "Clarify the guest request",
        body: "Distinguish a general amenity question, a new reservation enquiry and a private booking request. Apply the business-approved identity checks before discussing a guest record.",
      },
      {
        title: "Use current information",
        body: "Implement authorized access to booking details when needed. Explain rate terms and availability only from a current approved source; a quoted option is not a held reservation.",
      },
      {
        title: "Confirm actions and exceptions",
        body: "Route changes, cancellations and urgent guest issues to the approved process. Announce a completed reservation only after the permitted action returns a verified result. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "A hospitality or travel owner for information, policy exceptions and staff coverage.",
      "A tested connection to the relevant booking source with identity and permission controls.",
      "Language and accessibility tests using the actual configured speech and model providers.",
    ],
    checks: [
      {
        scenario: "The requested room is unavailable",
        expected:
          "Offer only verified alternatives or staff follow-up; do not create an availability claim.",
      },
      {
        scenario: "A cancellation result is uncertain",
        expected:
          "Check the destination before another action and state that confirmation is pending.",
      },
      {
        scenario: "A guest needs immediate assistance",
        expected:
          "Use the approved staff or emergency route, with a tested fallback if the first contact is unavailable.",
      },
    ],
    faqs: [
      {
        question: "Are reservation-system integrations included?",
        answer:
          "Verify the target booking API, permissions, rate rules and available operations with your implementation team. No named connector is assumed.",
      },
      {
        question: "Does QuickVoice support every guest language?",
        answer:
          "Language quality depends on the configured providers and workflow. Test required languages, names, addresses and escalation before launch rather than assuming a universal language count.",
      },
    ],
    guides: [
      {
        slug: "ai-appointment-scheduling-guide",
        title: "Plan verified scheduling",
      },
      {
        slug: "automated-appointment-reminders-guide",
        title: "Plan reminder eligibility and exceptions",
      },
    ],
  },
  "operations-automation": {
    path: "/use-cases/operations-automation",
    label: "Operations phone workflows",
    title: "Turn routine calls into accountable requests",
    description:
      "Plan vendor follow-up, field-service requests and staff availability intake with defined records, approved actions and a person responsible for exceptions.",
    introduction:
      "Start with one repeatable administrative call. Define the information to collect, the system that owns the record and the person who must act if a request cannot be completed. This creates a testable workflow rather than a promise to automate an entire department.",
    steps: [
      {
        title: "Map the trigger and audience",
        body: "Document why the call occurs, who may be contacted and which instructions are approved. Assign an owner for outreach timing and requests to stop.",
      },
      {
        title: "Capture a bounded response",
        body: "Ask for the minimum job, order or shift information needed. Keep an acknowledgement separate from a change to the system of record.",
      },
      {
        title: "Verify completion or handoff",
        body: "Implement and test the destination action before calling it automated. Identify a staff queue and response process for failed actions or ambiguous results. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "A process owner for the trigger, desired outcome and exception path.",
      "An engineering owner for event delivery, scoped credentials and permitted system actions.",
      "A baseline for staff effort, completion, errors and provider costs using consistent units.",
    ],
    checks: [
      {
        scenario: "The same event arrives twice",
        expected:
          "Use an implemented deduplication process and verify that a single intended action occurs.",
      },
      {
        scenario: "The destination times out after a write",
        expected:
          "Check its state before retrying; do not announce success or repeat an ambiguous mutation.",
      },
      {
        scenario: "An urgent operational issue arises",
        expected:
          "Route to the approved human process rather than improvising safety or equipment instructions.",
      },
    ],
    faqs: [
      {
        question: "Is an existing business workflow automated immediately?",
        answer:
          "No. Triggers, permissions, destination actions, monitoring and fallback must be implemented and tested for the actual process.",
      },
      {
        question: "How do we decide whether to expand?",
        answer:
          "Compare verified completion, staff follow-up, errors and total cost with the baseline. Use your own evidence; no automation rate or savings figure is promised.",
      },
    ],
    guides: [
      {
        slug: "build-ai-voice-agent-small-business",
        title: "Prepare the implementation",
      },
      {
        slug: "ai-voice-agents-reduce-customer-support-costs",
        title: "Evaluate support work and cost",
      },
    ],
  },
  "order-status-returns": {
    path: "/use-cases/order-status-returns",
    label: "Order status and returns workflows",
    title: "Answer order questions without guessing at the outcome",
    description:
      "Plan WISMO enquiries and return requests using authorized order lookups, current carrier information and verified actions.",
    introduction:
      "Separate a status read from a return or refund action. A bounded workflow can answer from an approved source or record what the shopper needs; it should only announce a completed return or refund after the destination confirms it.",
    steps: [
      {
        title: "Verify the caller and order",
        body: "Define identity checks appropriate to the information being disclosed. An order number alone should not grant access to addresses, payment details or another customer account.",
      },
      {
        title: "Explain the latest verified status",
        body: "Implement the order and carrier lookup, include the source time and distinguish estimates from completed delivery events. Route missing or conflicting records to support.",
      },
      {
        title: "Handle the return request",
        body: "Use the current return policy and an accountable exception owner. Return authorization, labels, exchanges and refunds are separate actions, each requiring a verified result. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "A support owner for return policy, eligibility exceptions and follow-up.",
      "A tested order and tracking connection with scoped access and stale-data handling.",
      "A separately implemented action path for each return or refund operation that is in scope.",
    ],
    checks: [
      {
        scenario: "Carrier and order records disagree",
        expected:
          "Explain that verification is needed and route the discrepancy; do not choose a plausible status.",
      },
      {
        scenario: "Customer requests a late return",
        expected:
          "Collect the request for the policy exception owner without inventing eligibility.",
      },
      {
        scenario: "Refund request times out",
        expected:
          "Check the payment or order system before retrying to prevent a duplicate refund.",
      },
    ],
    faqs: [
      {
        question: "Can the agent create a return label or issue a refund?",
        answer:
          "Only if that particular permitted action has been implemented, authorized and tested. Otherwise the next step is a request for staff review, not a completed transaction.",
      },
      {
        question: "What should we measure?",
        answer:
          "Check answer accuracy, source freshness, verified return outcomes, duplicate actions, staff follow-up and full cost. Evaluate savings and enquiry volume with your own baseline; this guide reports no measured customer results.",
      },
    ],
    guides: [
      {
        slug: "ai-voice-agents-reduce-customer-support-costs",
        title: "Evaluate support work and cost",
      },
      {
        slug: "ai-voice-agent-security-data-privacy",
        title: "Review data and access responsibilities",
      },
    ],
  },
  "reminders-collections": {
    path: "/use-cases/reminders-collections",
    label: "Reminder and payment follow-up workflows",
    title: "Keep follow-up specific, permitted and easy to escalate",
    description:
      "Plan appointment or payment reminders with verified contact eligibility, minimal disclosure, staff ownership and an explicit stop process.",
    introduction:
      "Appointment reminders and payment follow-up have different purposes and requirements. Design each workflow separately, obtain the relevant operational and legal review, and start with synthetic records before contacting anyone.",
    steps: [
      {
        title: "Confirm eligibility and timing",
        body: "Assign an owner to verify the audience, purpose, contact permission, time window and suppression process for the exact campaign. Do not treat an existing phone number as permission to call.",
      },
      {
        title: "Limit what the call reveals",
        body: "Use an approved identity check before discussing private appointment or account information. Keep voicemail and wrong-party messages minimal; do not collect raw card details into prompts or transcripts.",
      },
      {
        title: "Route requests and disputes",
        body: "Provide a clear staff path for disputes, hardship, rescheduling or requests to stop. Changes to payment terms or appointments require separately authorized and verified actions. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.",
      },
    ],
    requirements: [
      "A responsible owner for campaign purpose, eligibility, notices, timing and suppression.",
      "Qualified review of the exact jurisdiction, communication type and recipient circumstances.",
      "Verified account data, a human dispute process and tested provider/action boundaries.",
    ],
    checks: [
      {
        scenario: "The wrong person answers",
        expected:
          "Avoid disclosing the appointment, balance or debt; follow the approved wrong-party procedure.",
      },
      {
        scenario: "Recipient asks for no more calls",
        expected:
          "Use the implemented suppression and staff process, then verify that future eligibility checks honor the request.",
      },
      {
        scenario: "Customer disputes a balance or asks for different terms",
        expected:
          "Route to authorized staff without inventing an amount, threat, settlement or payment agreement.",
      },
    ],
    faqs: [
      {
        question: "Does this establish compliant debt collection?",
        answer:
          "No. A generic script, repository or call log does not establish legal compliance. Qualified owners must review the actual workflow, deployment, contracts, jurisdictions and operating process.",
      },
      {
        question: "Can the agent take payment or change a due date?",
        answer:
          "Those are separate business actions requiring an approved implementation and verified result. Use the organization-approved payment path and keep prohibited payment data out of the conversational system.",
      },
    ],
    guides: [
      {
        slug: "automated-appointment-reminders-guide",
        title: "Plan reminder eligibility and exceptions",
      },
      {
        slug: "ai-voice-agent-security-data-privacy",
        title: "Review data and access responsibilities",
      },
    ],
  },
};
