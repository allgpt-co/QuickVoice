import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getUseCaseContent } from "@/lib/industries";
import {
  CustomerSupportHeroSection,
  CustomerSupportUseCasesSection,
  CustomerSupportBenefitsSection,
  CustomerSupportDemoSection,
  CustomerSupportIntegrationsSection,
  CustomerSupportIndustriesSection,
  CustomerSupportSuccessSection,
  CustomerSupportFaqSection,
  CustomerSupportCtaSection,
} from "@/components/landing/customer-support";

export const metadata: Metadata = {
  title: "AI Customer Support Voice Agents",
  description:
    "Automate customer support with AI voice agents. Handle inquiries 24/7, reduce wait times, and boost customer satisfaction. No coding required. Free trial.",
  alternates: { canonical: "https://quickvoice.co/use-cases/customer-support" },
  openGraph: {
    title: "AI Customer Support Voice Agents | QuickVoice",
    description:
      "Automate customer support with AI voice agents. Handle inquiries 24/7, reduce wait times, and boost satisfaction.",
    url: "https://quickvoice.co/use-cases/customer-support",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Customer Support Voice Agents | QuickVoice",
    description:
      "Automate customer support with AI voice agents. Handle inquiries 24/7.",
    images: ["/og-image.png"],
  },
};

export default async function CustomerSupportPage() {
  const guideContent = getUseCaseContent("customer-support");

  const breadcrumbSchema = {
    "@context": "https://schema.org",
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
        name: "Use Cases",
        item: "https://quickvoice.co/use-cases",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Customer Support",
        item: "https://quickvoice.co/use-cases/customer-support",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <CustomerSupportHeroSection />
      <CustomerSupportUseCasesSection />
      <CustomerSupportBenefitsSection />
      <CustomerSupportDemoSection />
      <CustomerSupportIntegrationsSection />
      <CustomerSupportIndustriesSection />
      <CustomerSupportSuccessSection />
      <CustomerSupportFaqSection />
      <CustomerSupportCtaSection />
      {guideContent && <GuideContentSection content={guideContent} />}
      <RelatedPages
        title="Related Solutions"
        pages={[
          {
            title: "Sales & Lead Generation",
            href: "/use-cases/sales-lead-gen",
            description: "AI-powered outbound sales and lead qualification",
          },
          {
            title: "Order Status & Returns",
            href: "/use-cases/order-status-returns",
            description: "Automated order tracking and return processing",
          },
          {
            title: "Healthcare",
            href: "/industries/healthcare",
            description: "AI voice agents for healthcare organizations",
          },
          {
            title: "E-Commerce",
            href: "/industries/e-commerce",
            description: "AI voice agents for online retail",
          },
        ]}
      />
    </div>
  );
}
