import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getIndustryContent } from "@/lib/industries";
import {
  LogisticsHeroSection,
  LogisticsImpactSection,
  LogisticsFeaturesSection,
  LogisticsInsightsSection,
  LogisticsFaqSection,
  LogisticsCtaSection,
} from "@/components/landing/logistics";

export const metadata: Metadata = {
  title: "AI Voice Agents for Logistics & Supply Chain",
  description:
    "Explore AI phone-agent workflow patterns for shipment tracking, delivery notifications, driver coordination, and customer updates.",
  alternates: { canonical: "https://quickvoice.co/industries/logistics" },
  openGraph: {
    title: "AI Voice Agents for Logistics",
    description:
      "Automate shipment tracking, delivery notifications, and logistics operations with AI voice agents.",
    url: "https://quickvoice.co/industries/logistics",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agents for Logistics",
    description:
      "Automate shipment tracking, delivery notifications, and logistics operations with AI voice agents.",
    images: ["/og-image.png"],
  },
};

export default async function LogisticsPage() {
  const guideContent = getIndustryContent("logistics");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Conversational AI Support for Logistics | QuickVoice",
    description:
      "Transform your logistics customer support with QuickVoice's conversational AI. Automate customer interactions, reduce operational costs, and enhance customer satisfaction.",
    url: "https://quickvoice.co/industries/logistics",
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
          name: "Logistics",
          item: "https://quickvoice.co/industries/logistics",
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
        name: "How can AI voice agents help logistics companies handle order tracking inquiries?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents can instantly access your order management system to provide real-time tracking updates, delivery estimates, and shipment status. They can handle multiple tracking requests simultaneously, reducing wait times and freeing up human agents for more complex issues. The AI can also proactively notify customers about delays or delivery updates.",
        },
      },
      {
        "@type": "Question",
        name: "What types of logistics customer service tasks can be automated with conversational AI?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Conversational AI can automate order status inquiries, delivery scheduling, address changes, return and exchange requests, proof of delivery confirmations, basic billing questions, and appointment scheduling. It can also handle route optimization queries, carrier selection assistance, and provide shipping cost estimates in real-time.",
        },
      },
      {
        "@type": "Question",
        name: "How does AI voice technology integrate with existing logistics management systems?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Our AI voice agents integrate seamlessly with popular logistics platforms like SAP, Oracle WMS, Manhattan Associates, and custom TMS systems through APIs. The integration allows real-time data access for tracking, inventory levels, and customer information, ensuring accurate and up-to-date responses to customer inquiries.",
        },
      },
      {
        "@type": "Question",
        name: "Can AI voice agents handle complex logistics scenarios like damaged goods or delivery disputes?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "While AI agents excel at handling routine inquiries, they're designed to intelligently escalate complex scenarios like damaged goods claims or delivery disputes to human agents. The AI captures all relevant information, categorizes the issue severity, and provides complete context to the human agent for seamless handoff.",
        },
      },
      {
        "@type": "Question",
        name: "How does conversational AI improve logistics customer satisfaction during peak seasons?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "During peak seasons, AI voice agents provide 24/7 availability, eliminate hold times, and can handle unlimited simultaneous conversations. They maintain consistent service quality regardless of volume, provide instant responses to common questions, and ensure customers receive immediate assistance even during high-demand periods like holidays or promotional events.",
        },
      },
      {
        "@type": "Question",
        name: "What security measures are in place for handling sensitive logistics and customer data?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Our platform employs enterprise-grade security including end-to-end encryption, SOC 2 Type II compliance, GDPR compliance, and role-based access controls. All customer data and logistics information are protected with advanced security protocols, and we maintain detailed audit logs for all interactions and data access.",
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
        <LogisticsHeroSection />
        <LogisticsImpactSection />
        <LogisticsFeaturesSection />
        <LogisticsInsightsSection />
        <LogisticsFaqSection />
        <LogisticsCtaSection />
        {guideContent && <GuideContentSection content={guideContent} />}
        <RelatedPages
          title="Related Solutions & Industries"
          pages={[
            {
              title: "Order Status & Returns",
              href: "/use-cases/order-status-returns",
              description: "Automate shipment tracking and delivery updates",
            },
            {
              title: "Operations Automation",
              href: "/use-cases/operations-automation",
              description: "Streamline logistics workflows and coordination",
            },
            {
              title: "Customer Support",
              href: "/use-cases/customer-support",
              description: "AI-powered support for shipping inquiries",
            },
            {
              title: "E-Commerce",
              href: "/industries/e-commerce",
              description: "AI voice agents for online retail operations",
            },
            {
              title: "Manufacturing & Engineering",
              href: "/industries/manufacturing-engineering",
              description: "AI voice agents for manufacturing operations",
            },
          ]}
        />
      </div>
    </>
  );
}
