import type { Metadata } from "next";
import {
  IndustriesHeroSection,
  IndustriesGridSection,
  IndustriesCtaSection,
} from "@/components/landing/industries-main";

export const metadata: Metadata = {
  title: "AI Voice Agent Solutions by Industry",
  description:
    "Explore how open-source AI phone-agent infrastructure can be adapted for healthcare, real estate, finance, e-commerce, logistics, and other industries.",
  alternates: {
    canonical: "https://quickvoice.co/industries",
  },
  openGraph: {
    title: "AI Voice Agent Solutions by Industry",
    description:
      "Explore bounded AI phone-agent workflows by industry, with explicit provider, data, and deployment boundaries.",
    type: "website",
    url: "https://quickvoice.co/industries",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agent Solutions by Industry",
    description:
      "Explore bounded AI phone-agent workflows by industry, with explicit provider, data, and deployment boundaries.",
    images: ["/og-image.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "AI Voice Agent Solutions by Industry | QuickVoice",
  description:
    "Discover how QuickVoice's AI-powered voice agents transform customer interactions, streamline operations, and drive growth across diverse industries including healthcare, e-commerce, financial services, and more.",
  url: "https://quickvoice.co/industries",
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
    ],
  },
};

export default function IndustriesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <IndustriesHeroSection />
      <IndustriesGridSection />
      <IndustriesCtaSection />
    </div>
  );
}
