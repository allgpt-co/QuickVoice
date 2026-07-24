import type { Metadata } from "next";

import {
  AutomotiveHeroSection,
  AutomotiveFeaturesSection,
  AutomotiveBenefitsSection,
  AutomotiveFaqSection,
  AutomotiveCtaSection,
} from "@/components/landing/automotive";
import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getIndustryContent } from "@/lib/industries";

export const metadata: Metadata = {
  title: "AI Voice Agents for Automotive Dealers & Service Centers",
  description:
    "Explore AI phone-agent workflow patterns for automotive appointment booking, service reminders, lead qualification, and customer follow-up.",
  alternates: { canonical: "https://quickvoice.co/industries/automotive" },
  openGraph: {
    title: "AI Voice Agents for Automotive",
    description:
      "Automate appointment booking, service reminders, and lead qualification for automotive dealers with AI voice agents.",
    url: "https://quickvoice.co/industries/automotive",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agents for Automotive",
    description:
      "Automate appointment booking, service reminders, and lead qualification for automotive dealers with AI voice agents.",
    images: ["/og-image.png"],
  },
};

export default async function AutomotivePage() {
  const guideContent = getIndustryContent("automotive");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "AI Voice Assistants for Automotive Dealerships | QuickVoice",
    description:
      "Revolutionize customer engagement with QuickVoice's AI-powered voice assistants. Streamline test drive scheduling, lead qualification, and sales processes for automotive dealerships.",
    url: "https://quickvoice.co/industries/automotive",
    mainEntity: {
      "@type": "WebApplication",
      name: "QuickVoice",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0.13",
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
          name: "Automotive",
          item: "https://quickvoice.co/industries/automotive",
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
        name: "How does QuickVoice integrate with automotive DMS and CRM systems?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice offers seamless integration with leading automotive DMS and CRM systems including CDK Global, Reynolds & Reynolds, DealerSocket, and more. Our API-first approach allows real-time data synchronization for customer history, VIN information, service records, and appointment scheduling. The AI can pull relevant customer data during calls to provide personalized service and accurate information.",
        },
      },
      {
        "@type": "Question",
        name: "Can QuickVoice handle test drive scheduling and service appointment booking?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, QuickVoice excels at automated test drive scheduling and service appointment booking. The AI can check real-time availability, coordinate with your service department, send automated reminders, and even reschedule appointments based on customer preferences. It reduces no-shows by 40% through intelligent follow-up and confirmation processes.",
        },
      },
      {
        "@type": "Question",
        name: "How does the AI qualify leads for automotive sales?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice uses advanced AI to qualify leads by asking targeted questions about budget, timeline, vehicle preferences, trade-in status, and financing needs. It can identify high-intent customers, capture key information, and route qualified leads to the appropriate sales team member. The system learns from your best practices to continuously improve lead qualification accuracy.",
        },
      },
      {
        "@type": "Question",
        name: "Is QuickVoice compliant with automotive industry regulations and TCPA?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Absolutely. QuickVoice is fully TCPA compliant with built-in consent management, local caller ID capabilities, and automatic opt-out handling. We maintain SOC 2 Type II certification and follow automotive industry best practices for data security and customer privacy. All call recordings and customer data are handled according to strict compliance standards.",
        },
      },
      {
        "@type": "Question",
        name: "How quickly can we implement QuickVoice in our automotive dealership?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice offers rapid deployment with our no-code configuration platform. Most automotive dealerships can be up and running within 2-3 weeks, including DMS integration, staff training, and workflow optimization. Our dedicated automotive implementation team ensures smooth transition with minimal disruption to your daily operations.",
        },
      },
      {
        "@type": "Question",
        name: "What kind of analytics and reporting does QuickVoice provide for automotive businesses?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice provides comprehensive analytics including call volume metrics, lead conversion rates, test drive scheduling success rates, customer satisfaction scores, and sales performance tracking. You can monitor which campaigns are most effective, track ROI, and get insights into customer behavior patterns. All data is available in real-time dashboards with customizable reporting.",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <AutomotiveHeroSection />
      <AutomotiveFeaturesSection />
      <AutomotiveBenefitsSection />
      <AutomotiveFaqSection />
      <AutomotiveCtaSection />
      {guideContent && <GuideContentSection content={guideContent} />}
      <RelatedPages
        title="Related Solutions & Industries"
        pages={[
          {
            title: "Sales & Lead Generation",
            href: "/use-cases/sales-lead-gen",
            description: "AI-powered lead qualification and sales outreach",
          },
          {
            title: "Appointment Scheduling",
            href: "/use-cases/appointment-scheduling",
            description: "Automate test drive and service appointment booking",
          },
          {
            title: "24/7 Customer Support",
            href: "/use-cases/customer-support",
            description: "AI-powered customer support that never sleeps",
          },
          {
            title: "Reminders & Collections",
            href: "/use-cases/reminders-collections",
            description: "Automated service reminders and payment follow-ups",
          },
          {
            title: "Real Estate",
            href: "/industries/real-estate",
            description: "AI voice agents for property sales and management",
          },
          {
            title: "E-Commerce",
            href: "/industries/e-commerce",
            description: "AI voice agents for online retail operations",
          },
        ]}
      />
    </div>
  );
}
