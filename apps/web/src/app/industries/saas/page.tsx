import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getIndustryContent } from "@/lib/industries";
import {
  SaasHeroSection,
  SaasFeaturesSection,
  SaasBenefitsSection,
  SaasFaqSection,
  SaasCtaSection,
} from "@/components/landing/saas";

export const metadata: Metadata = {
  title: "AI Voice Agents for SaaS Companies | Onboarding & Support",
  description:
    "Explore AI phone-agent workflow patterns for SaaS onboarding, renewal reminders, retention outreach, and support.",
  alternates: { canonical: "https://quickvoice.co/industries/saas" },
  openGraph: {
    title: "AI Voice Agents for SaaS",
    description:
      "Automate customer onboarding, renewals, and support for SaaS companies with AI voice agents.",
    url: "https://quickvoice.co/industries/saas",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agents for SaaS",
    description:
      "Automate customer onboarding, renewals, and support for SaaS companies with AI voice agents.",
    images: ["/og-image.png"],
  },
};

export default async function SaasPage() {
  const guideContent = getIndustryContent("saas");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "AI Call Software Solutions | QuickVoice",
    description:
      "Transform customer engagement with QuickVoice's AI call software solutions. Automate routine interactions, improve efficiency, and deliver exceptional customer experiences.",
    url: "https://quickvoice.co/industries/saas",
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
          name: "SaaS",
          item: "https://quickvoice.co/industries/saas",
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
        name: "How can AI voice agents improve customer onboarding for SaaS companies?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents can significantly streamline SaaS customer onboarding by providing instant support during setup, answering common configuration questions, guiding users through feature tutorials, and scheduling personalized demo calls. This reduces time-to-value for new customers and decreases support ticket volume by up to 70% during the critical onboarding phase.",
        },
      },
      {
        "@type": "Question",
        name: "Can QuickVoice integrate with popular SaaS platforms like Salesforce, HubSpot, and Zendesk?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, QuickVoice offers native integrations with all major SaaS platforms including Salesforce, HubSpot, Zendesk, Intercom, and many others. Our API-first approach ensures seamless data synchronization, allowing AI voice agents to access customer information, update records, and trigger workflows across your entire tech stack in real-time.",
        },
      },
      {
        "@type": "Question",
        name: "How does AI call software handle complex technical support queries for SaaS products?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Our AI voice agents are trained on technical documentation and can handle complex SaaS support queries including API troubleshooting, integration issues, billing questions, and feature explanations. When queries exceed the AI's capabilities, it seamlessly escalates to human agents with full context, ensuring customers always receive appropriate support.",
        },
      },
      {
        "@type": "Question",
        name: "What security measures does QuickVoice implement for SaaS companies handling sensitive customer data?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice implements enterprise-grade security including SOC 2 Type II compliance, end-to-end encryption, secure data centers, and comprehensive audit logs. We offer Business Associate Agreements (BAA) for healthcare SaaS companies and maintain strict data privacy protocols to ensure your customer data remains secure and compliant with industry regulations.",
        },
      },
      {
        "@type": "Question",
        name: "How can SaaS companies use AI voice agents for customer success and retention?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents excel at proactive customer success by conducting health checks, identifying at-risk accounts, scheduling renewal calls, and gathering feedback. They can automatically reach out to customers showing low engagement, offer personalized training sessions, and ensure customers are getting maximum value from your SaaS platform, ultimately improving retention rates.",
        },
      },
      {
        "@type": "Question",
        name: "Does QuickVoice support multi-tenant SaaS architectures and customer isolation?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Absolutely. QuickVoice is designed for multi-tenant SaaS environments with complete customer data isolation. Each tenant's AI voice agents operate independently with their own knowledge base, call routing, and analytics. Our platform ensures strict data segregation and provides tenant-specific customization options while maintaining scalability and performance.",
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
        <SaasHeroSection />
        <SaasFeaturesSection />
        <SaasBenefitsSection />
        <SaasFaqSection />
        <SaasCtaSection />
        {guideContent && <GuideContentSection content={guideContent} />}
        <RelatedPages
          title="Related Solutions & Industries"
          pages={[
            {
              title: "Customer Support",
              href: "/use-cases/customer-support",
              description: "AI-powered support for SaaS customers",
            },
            {
              title: "Sales & Lead Generation",
              href: "/use-cases/sales-lead-gen",
              description: "Automate demo scheduling and lead qualification",
            },
            {
              title: "Reminders & Collections",
              href: "/use-cases/reminders-collections",
              description: "Automated renewal reminders and billing follow-ups",
            },
            {
              title: "E-Commerce",
              href: "/industries/e-commerce",
              description: "AI voice agents for online retail operations",
            },
            {
              title: "Financial Services",
              href: "/industries/financial-services",
              description: "AI voice agents for banking and insurance",
            },
          ]}
        />
      </div>
    </>
  );
}
