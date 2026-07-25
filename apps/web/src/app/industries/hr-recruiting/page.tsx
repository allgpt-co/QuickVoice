import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getIndustryContent } from "@/lib/industries";
import {
  HrRecruitingHeroSection,
  HrRecruitingFeaturesSection,
  HrRecruitingIntegrationSection,
  HrRecruitingCapabilitiesSection,
  HrRecruitingFaqSection,
  HrRecruitingCtaSection,
} from "@/components/landing/hr-recruiting";

export const metadata: Metadata = {
  title: "AI Voice Agents for HR & Recruiting | Candidate Screening",
  description:
    "Explore AI phone-agent workflow patterns for candidate screening, interview scheduling, and HR follow-up with explicit data and provider boundaries.",
  alternates: { canonical: "https://quickvoice.co/industries/hr-recruiting" },
  openGraph: {
    title: "AI Voice Agents for HR & Recruiting",
    description:
      "Automate candidate screening, interview scheduling, and HR operations with AI voice agents.",
    url: "https://quickvoice.co/industries/hr-recruiting",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agents for HR & Recruiting",
    description:
      "Automate candidate screening, interview scheduling, and HR operations with AI voice agents.",
    images: ["/og-image.png"],
  },
};

export default async function HrRecruitingPage() {
  const guideContent = getIndustryContent("hr-recruiting");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Transform Recruitment with QuickVoice: AI-Powered Recruiting Assistant",
    description:
      "Unlock the power of conversational AI in recruitment with QuickVoice. Automate administrative tasks, streamline candidate screening, and provide a magical candidate experience.",
    url: "https://quickvoice.co/industries/hr-recruiting",
    mainEntity: {
      "@type": "WebApplication",
      name: "QuickVoice",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://quickvoice.co",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Industries",
          item: "https://quickvoice.co/industries",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "HR & Recruiting",
          item: "https://quickvoice.co/industries/hr-recruiting",
        },
      ],
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How can AI voice agents improve the candidate screening process in recruitment?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents can conduct consistent, structured interviews with all candidates, asking standardized questions and evaluating responses objectively. This eliminates human bias, ensures compliance with hiring regulations, and provides detailed analytics on candidate responses. The AI can screen candidates 24/7, significantly reducing time-to-hire while maintaining quality standards.",
        },
      },
      {
        "@type": "Question",
        name: "What types of HR administrative tasks can be automated with conversational AI?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Conversational AI can automate interview scheduling, candidate status updates, reference checks, onboarding document collection, benefits enrollment guidance, leave request processing, payroll inquiries, policy explanations, and basic HR support tickets. This frees up HR professionals to focus on strategic initiatives and high-value human interactions.",
        },
      },
      {
        "@type": "Question",
        name: "How does AI voice technology integrate with existing HRMS and ATS systems?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Our AI voice agents integrate seamlessly with popular HRMS/ATS platforms like Workday, SAP SuccessFactors, BambooHR, and others through APIs. The integration allows real-time data synchronization, automatic candidate profile updates, interview scheduling coordination, and comprehensive reporting across all systems without manual data entry.",
        },
      },
      {
        "@type": "Question",
        name: "Can AI voice agents handle complex HR scenarios like employee grievances or sensitive inquiries?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "While AI agents excel at routine inquiries and initial triage, they're designed to intelligently escalate complex or sensitive matters to human HR professionals. The AI captures all relevant context, categorizes the issue appropriately, and ensures seamless handoff with complete conversation history to maintain continuity and confidentiality.",
        },
      },
      {
        "@type": "Question",
        name: "How does conversational AI improve the employee experience during onboarding and beyond?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents provide 24/7 support for new hires, guiding them through onboarding processes, answering policy questions, helping with benefits enrollment, and providing consistent information. For ongoing support, employees can get instant answers about leave policies, payroll questions, and HR procedures, improving satisfaction and reducing HR workload.",
        },
      },
      {
        "@type": "Question",
        name: "What security and compliance measures are in place for handling sensitive HR data?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Our platform employs enterprise-grade security including end-to-end encryption, SOC 2 Type II compliance, GDPR compliance, and HIPAA alignment where applicable. All employee and candidate data are protected with advanced security protocols, role-based access controls, and detailed audit logs. We maintain strict data privacy standards and comply with all relevant employment regulations.",
        },
      },
    ],
  };

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
        <HrRecruitingHeroSection />
        <HrRecruitingFeaturesSection />
        <HrRecruitingIntegrationSection />
        <HrRecruitingCapabilitiesSection />
        <HrRecruitingFaqSection />
        <HrRecruitingCtaSection />
        {guideContent && <GuideContentSection content={guideContent} />}
        <RelatedPages
          title="Related Solutions & Industries"
          pages={[
            {
              title: "Appointment Scheduling",
              href: "/use-cases/appointment-scheduling",
              description: "Automate interview and meeting scheduling",
            },
            {
              title: "Sales & Lead Generation",
              href: "/use-cases/sales-lead-gen",
              description: "AI-powered candidate sourcing and outreach",
            },
            {
              title: "Operations Automation",
              href: "/use-cases/operations-automation",
              description: "Streamline HR workflows and processes",
            },
            {
              title: "AI Customer Support",
              href: "/use-cases/customer-support",
              description:
                "Automate customer inquiries with intelligent voice agents",
            },
            {
              title: "Education",
              href: "/industries/education",
              description: "AI voice agents for educational institutions",
            },
          ]}
        />
      </div>
    </>
  );
}
