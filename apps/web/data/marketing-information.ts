import type { InformationPageContent } from "@/components/seo/information-page";

export const marketingInformation: Record<string, InformationPageContent> = {
  about: {
    path: "/company/about-us",
    label: "About QuickVoice",
    title: "An inspectable foundation for business voice workflows",
    description:
      "Learn about QuickVoice's open-source voice-agent project, deployment model and practical approach to business phone workflows.",
    introduction:
      "QuickVoice is an open-source voice-agent platform for teams that want to inspect, configure and operate their own stack. The project brings a website, console, API and voice worker into one repository.",
    sections: [
      {
        title: "Start with a business question",
        body: "A useful phone workflow has a defined audience, approved information and an accountable person for unresolved requests. Begin with one bounded enquiry or intake task, then evaluate it against your own baseline.",
        links: [
          { href: "/use-cases", label: "Explore workflow planning guides" },
        ],
      },
      {
        title: "Source you can inspect",
        body: "The repository is available under the MIT license and is under active development. Source access lets your technical team review implementation and changes; it does not establish production readiness for your deployment.",
        links: [
          {
            href: "https://github.com/allgpt-co/QuickVoice",
            label: "View the repository",
          },
          { href: "/open-source", label: "Understand the open-source stack" },
        ],
      },
      {
        title: "An operated system",
        body: "Real calls require configured voice infrastructure, telephony and model providers. Your team owns provider accounts, deployment controls, monitoring and human follow-up. Software licensing and the cost of running calls are separate.",
        links: [{ href: "/pricing", label: "Review cost considerations" }],
      },
      {
        title: "Follow the project",
        body: "Use the repository for source and contribution information. The official QuickVoice LinkedIn profile is linked below for project updates.",
        links: [
          {
            href: "https://www.linkedin.com/company/quickvoiceai",
            label: "QuickVoice on LinkedIn",
          },
          {
            href: "/company/careers",
            label: "Contributions and career enquiries",
          },
        ],
      },
    ],
  },
  careers: {
    path: "/company/careers",
    label: "Contributions and careers",
    title: "Work on practical voice-agent problems",
    description:
      "Explore QuickVoice's source, contribution guidance and contact route for current employment or collaboration opportunities.",
    introduction:
      "QuickVoice spans a web experience, an operator console, an API and a voice worker. Explore the project to understand the work, or contact the team to ask about current employment and collaboration opportunities.",
    sections: [
      {
        title: "Explore before contributing",
        body: "Read the repository setup and contribution guidance, reproduce a relevant issue and discuss the intended change. Useful contributions can include a focused bug fix, a clearer setup instruction or evidence from a reproducible test.",
        links: [
          {
            href: "https://github.com/allgpt-co/QuickVoice",
            label: "Read the project and contribution guidance",
          },
          {
            href: "https://github.com/allgpt-co/QuickVoice/issues",
            label: "Browse repository issues",
          },
        ],
      },
      {
        title: "Ask about current opportunities",
        body: "Contact the team with your area of interest and a link to relevant work. Ask for a confirmed role description, location requirements, compensation and hiring process before treating an enquiry as an open position.",
        links: [{ href: "/company/contact", label: "Send a career enquiry" }],
      },
      {
        title: "Understand the product context",
        body: "The work includes agent configuration, call workflows, provider setup, operator tools and the handoff to people. Evaluate the actual implementation and current issues rather than assuming every planned workflow is available.",
        links: [
          { href: "/open-source", label: "Inspect the platform boundaries" },
          { href: "/use-cases", label: "Read business workflow guides" },
        ],
      },
      {
        title: "Keep in touch",
        body: "Follow the official QuickVoice profile and repository for project updates. Contributions and employment enquiries follow separate discussions; this page does not announce a specific vacancy or benefits package.",
        links: [
          {
            href: "https://www.linkedin.com/company/quickvoiceai",
            label: "QuickVoice on LinkedIn",
          },
        ],
      },
    ],
  },
  industries: {
    path: "/industries",
    label: "Industry workflow guides",
    title: "Plan around the calls your industry receives",
    description:
      "Explore industry-specific phone workflow requirements, data boundaries and human escalation before implementing QuickVoice.",
    introduction:
      "Choose an industry to review its phone requests, sensitive information and exception paths. These guides describe implementation patterns and evaluation criteria; they do not establish customer deployments, built-in industry integrations or measured customer results.",
    sections: [
      {
        title: "Retail and e-commerce",
        body: "Product questions, order information and return requests need maintained policy content and authorized order access.",
        links: [
          {
            href: "/industries/e-commerce",
            label: "Read the retail and e-commerce guide",
          },
        ],
      },
      {
        title: "Healthcare",
        body: "Administrative intake and scheduling require a full review of patient information, providers, agreements and human escalation.",
        links: [
          {
            href: "/industries/healthcare",
            label: "Read the healthcare guide",
          },
        ],
      },
      {
        title: "Financial services",
        body: "Account enquiries and follow-up need verified identity, restricted disclosure and responsible staff for regulated decisions.",
        links: [
          {
            href: "/industries/financial-services",
            label: "Read the financial services guide",
          },
        ],
      },
      {
        title: "Real estate",
        body: "Property enquiries, viewing requests and tenant questions depend on current records and a confirmed staff process.",
        links: [
          {
            href: "/industries/real-estate",
            label: "Read the real estate guide",
          },
        ],
      },
      {
        title: "Automotive",
        body: "Service, test-drive and vehicle enquiries need current dealership information and verified scheduling actions.",
        links: [
          {
            href: "/industries/automotive",
            label: "Read the automotive guide",
          },
        ],
      },
      {
        title: "Travel and hospitality",
        body: "Guest questions and reservation requests depend on current rates, availability and a tested staff fallback.",
        links: [
          {
            href: "/industries/travel-hospitality",
            label: "Read the travel and hospitality guide",
          },
        ],
      },
      {
        title: "Education",
        body: "Admissions and campus enquiries need approved institutional information and distinct controls for student records.",
        links: [
          {
            href: "/industries/education",
            label: "Read the education guide",
          },
        ],
      },
      {
        title: "SaaS",
        body: "Onboarding, support and renewal callbacks require current documentation and tenant-specific authorization.",
        links: [
          {
            href: "/industries/saas",
            label: "Read the saas guide",
          },
        ],
      },
      {
        title: "Logistics",
        body: "Shipment enquiries and delivery changes need a current source, restricted details and accountable operations staff.",
        links: [
          {
            href: "/industries/logistics",
            label: "Read the logistics guide",
          },
        ],
      },
      {
        title: "HR and recruiting",
        body: "Candidate information and interview availability belong alongside human employment decisions and accessibility support.",
        links: [
          {
            href: "/industries/hr-recruiting",
            label: "Read the hr and recruiting guide",
          },
        ],
      },
      {
        title: "Manufacturing and engineering",
        body: "Supplier responses, maintenance requests and shift availability need clear source records and operational ownership.",
        links: [
          {
            href: "/industries/manufacturing-engineering",
            label: "Read the manufacturing and engineering guide",
          },
        ],
      },
    ],
  },
  usecases: {
    path: "/use-cases",
    label: "Business phone use cases",
    title: "Choose one call workflow to evaluate",
    description:
      "Compare support, scheduling, lead intake, order enquiries, operations and reminder workflows with explicit implementation and evaluation requirements.",
    introduction:
      "Define the call purpose, approved information, system of record and human owner before a pilot. QuickVoice provides an inspectable foundation; provider accounts, system connections and permitted actions still need configuration and testing.",
    sections: [
      {
        title: "Customer support",
        body: "Answer from maintained information, collect unresolved questions and test the staff handoff.",
        links: [
          {
            href: "/use-cases/customer-support",
            label: "Review workflow requirements",
          },
        ],
      },
      {
        title: "Sales and lead generation",
        body: "Collect a prospect request against approved criteria and route it to an accountable sales owner. Verify follow-up eligibility.",
        links: [
          {
            href: "/use-cases/sales-lead-gen",
            label: "Review workflow requirements",
          },
        ],
      },
      {
        title: "Appointment scheduling",
        body: "Distinguish availability and booking requests from a reservation confirmed by the scheduling system.",
        links: [
          {
            href: "/use-cases/appointment-scheduling",
            label: "Review workflow requirements",
          },
        ],
      },
      {
        title: "Reminders and payment follow-up",
        body: "Keep appointment and payment workflows separate. Review contact eligibility, minimal disclosure, suppression and the human dispute process.",
        links: [
          {
            href: "/use-cases/reminders-collections",
            label: "Review workflow requirements",
          },
        ],
      },
      {
        title: "Order status and returns",
        body: "Use authorized, current order information and verify each return or refund action before announcing completion.",
        links: [
          {
            href: "/use-cases/order-status-returns",
            label: "Review workflow requirements",
          },
        ],
      },
      {
        title: "Operations requests",
        body: "Define the trigger, collect a bounded response and verify whether the destination action or staff handoff completed.",
        links: [
          {
            href: "/use-cases/operations-automation",
            label: "Review workflow requirements",
          },
        ],
      },
    ],
  },
  solutions: {
    path: "/solutions",
    label: "Phone-agent solutions",
    title: "Start with the front-office workflow you can define",
    description:
      "Review AI receptionist, answering-service and appointment-request workflows with provider, data, action and handoff requirements.",
    introduction:
      "Choose a bounded phone workflow and decide what a successful call means for your team. Configure approved information and provider accounts, then test data access, action confirmation and human follow-up before launch.",
    sections: [
      {
        title: "AI receptionist",
        body: "Plan a greeting, identify the reason for calling and define routing or message intake. Staff availability and transfer failures need a tested fallback.",
        links: [
          {
            href: "/solutions/ai-receptionist",
            label: "Plan a receptionist workflow",
          },
        ],
      },
      {
        title: "AI answering service",
        body: "Collect the details your team needs from an incoming call and specify who will act on them. A recorded request is useful only when the follow-up process is clear.",
        links: [
          {
            href: "/solutions/ai-answering-service",
            label: "Plan an answering workflow",
          },
        ],
      },
      {
        title: "Appointment requests",
        body: "Use verified availability and a permitted booking action. Keep a requested time distinct from a confirmed appointment and test conflicts, time zones and uncertain results.",
        links: [
          {
            href: "/use-cases/appointment-scheduling",
            label: "Plan request intake and booking",
          },
        ],
      },
      {
        title: "Implementation and cost",
        body: "Real calls require technical ownership and configured providers. The default live MCP bridge restricts tools marked as writes or side effects; booking or other system changes need a separately implemented permitted action path.",
        links: [
          {
            href: "/open-source",
            label: "Inspect setup boundaries",
          },
          {
            href: "/pricing",
            label: "Review operating costs",
          },
          {
            href: "/use-cases",
            label: "Compare other business workflows",
          },
        ],
      },
    ],
  },
};
