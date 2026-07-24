import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getUseCaseContent } from "@/lib/industries";
import {
  SalesLeadGenHeroSection,
  SalesLeadGenCapabilitiesSection,
  SalesLeadGenTouchpointsSection,
  SalesLeadGenCatalogSection,
  SalesLeadGenPostPurchaseSection,
  SalesLeadGenIndustriesSection,
  SalesLeadGenCtaSection,
} from "@/components/landing/sales-lead-gen";

export const metadata: Metadata = {
  title: "AI Sales & Lead Generation Voice Agents",
  description:
    "Boost sales with AI voice agents that qualify leads, schedule demos, and follow up automatically. Increase conversion rates 24/7. Free trial.",
  alternates: { canonical: "https://quickvoice.co/use-cases/sales-lead-gen" },
  openGraph: {
    title: "AI Sales & Lead Generation Voice Agents | QuickVoice",
    description:
      "Boost sales with AI voice agents that qualify leads, schedule demos, and follow up automatically.",
    url: "https://quickvoice.co/use-cases/sales-lead-gen",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Sales & Lead Generation Voice Agents | QuickVoice",
    description:
      "Boost sales with AI voice agents that qualify leads and follow up automatically.",
    images: ["/og-image.png"],
  },
};

export default async function SalesLeadGenPage() {
  const guideContent = getUseCaseContent("sales-lead-gen");

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
        name: "Sales & Lead Generation",
        item: "https://quickvoice.co/use-cases/sales-lead-gen",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <SalesLeadGenHeroSection />
      <SalesLeadGenCapabilitiesSection />
      <SalesLeadGenTouchpointsSection />
      <SalesLeadGenCatalogSection />
      <SalesLeadGenPostPurchaseSection />
      <SalesLeadGenIndustriesSection />
      <SalesLeadGenCtaSection />
      {guideContent && <GuideContentSection content={guideContent} />}
      <RelatedPages
        title="Related Solutions"
        pages={[
          {
            title: "Customer Support",
            href: "/use-cases/customer-support",
            description: "AI-powered customer support automation",
          },
          {
            title: "Appointment Scheduling",
            href: "/use-cases/appointment-scheduling",
            description: "Automated booking and scheduling",
          },
          {
            title: "Automotive",
            href: "/industries/automotive",
            description: "AI voice agents for automotive dealerships",
          },
          {
            title: "Real Estate",
            href: "/industries/real-estate",
            description: "AI voice agents for real estate",
          },
        ]}
      />
    </div>
  );
}
