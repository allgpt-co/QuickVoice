import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getIndustryContent } from "@/lib/industries";
import {
  EcommerceHeroSection,
  EcommerceFeaturesSection,
  EcommerceBenefitsSection,
  EcommerceFaqSection,
  EcommerceCtaSection,
} from "@/components/landing/e-commerce";

export const metadata: Metadata = {
  title: "AI Voice Agents for E-Commerce | Order Tracking & Support",
  description:
    "Explore AI phone-agent workflow patterns for e-commerce order status, returns processing, and customer support.",
  alternates: { canonical: "https://quickvoice.co/industries/e-commerce" },
  openGraph: {
    title: "AI Voice Agents for E-Commerce",
    description:
      "Automate order tracking, returns, and customer support for e-commerce with AI voice agents.",
    url: "https://quickvoice.co/industries/e-commerce",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agents for E-Commerce",
    description:
      "Automate order tracking, returns, and customer support for e-commerce with AI voice agents.",
    images: ["/og-image.png"],
  },
};

export default async function EcommercePage() {
  const guideContent = getIndustryContent("e-commerce");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Unlock Conversational AI for Ecommerce Excellence with QuickVoice",
    description:
      "Elevate your ecommerce customer experience with QuickVoice's generative AI-powered conversational platform. Transform customer support, boost sales, and streamline operations.",
    url: "https://quickvoice.co/industries/e-commerce",
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
          name: "E-commerce",
          item: "https://quickvoice.co/industries/e-commerce",
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
        name: "How can AI voice agents help reduce cart abandonment in e-commerce?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents can proactively reach out to customers who abandon their carts through automated calls or SMS. They can offer personalized discounts, answer product questions, help with checkout issues, and guide customers through the purchase process. This proactive approach can recover 15-30% of abandoned carts, significantly boosting revenue.",
        },
      },
      {
        "@type": "Question",
        name: "What types of customer support queries can AI voice agents handle for online retailers?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents excel at handling common e-commerce queries including order status (WISMO), shipping information, return and exchange policies, product availability, sizing questions, warranty information, store hours, and general product inquiries. They can also handle complex multi-step processes like processing returns or scheduling appointments.",
        },
      },
      {
        "@type": "Question",
        name: "How do AI voice agents integrate with existing e-commerce platforms like Shopify or WooCommerce?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice offers seamless integration with major e-commerce platforms through APIs and webhooks. The AI agents can access real-time inventory data, customer order history, product catalogs, and CRM information. This allows them to provide accurate, personalized assistance while maintaining data consistency across all your systems.",
        },
      },
      {
        "@type": "Question",
        name: "Can AI voice agents help with upselling and cross-selling in retail?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, AI voice agents are excellent at guided selling. They can analyze customer preferences, suggest complementary products, offer bundle deals, and recommend items based on purchase history. During support calls, they can identify upsell opportunities and present them naturally in conversation, often increasing average order value by 20-40%.",
        },
      },
      {
        "@type": "Question",
        name: "How do AI voice agents handle multilingual customer support for global e-commerce?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice's AI agents support over 100 languages and can automatically detect the customer's preferred language. They can seamlessly switch between languages during a conversation and provide culturally appropriate responses. This enables 24/7 multilingual support without the need for multilingual staff, expanding your global reach.",
        },
      },
      {
        "@type": "Question",
        name: "What analytics and insights do AI voice agents provide for e-commerce optimization?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI voice agents provide comprehensive analytics including customer satisfaction scores, common query patterns, conversion rates, average handling time, and revenue impact. They can identify trends in customer behavior, product issues, and support bottlenecks. This data helps optimize product offerings, improve customer experience, and make data-driven business decisions.",
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
      <EcommerceHeroSection />
      <EcommerceFeaturesSection />
      <EcommerceBenefitsSection />
      <EcommerceFaqSection />
      <EcommerceCtaSection />
      {guideContent && <GuideContentSection content={guideContent} />}
      <RelatedPages
        title="Related Solutions & Industries"
        pages={[
          {
            title: "Customer Support",
            href: "/use-cases/customer-support",
            description: "AI-powered support for online shoppers",
          },
          {
            title: "Order Status & Returns",
            href: "/use-cases/order-status-returns",
            description: "Automate order tracking and return processing",
          },
          {
            title: "Logistics",
            href: "/industries/logistics",
            description: "AI voice agents for supply chain and delivery",
          },
          {
            title: "SaaS",
            href: "/industries/saas",
            description: "AI voice agents for software companies",
          },
        ]}
      />
    </div>
  );
}
