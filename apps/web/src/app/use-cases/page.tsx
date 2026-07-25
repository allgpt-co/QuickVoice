import type { Metadata } from "next";
import {
  UseCasesHeroSection,
  UseCasesGridSection,
  UseCasesCtaSection,
} from "@/components/landing/usecases-main";

export const metadata: Metadata = {
  title: "AI Voice Agent Use Cases — Support, Scheduling, Sales",
  description:
    "Explore AI phone-agent workflow patterns for support, scheduling, sales, order tracking, collections, and operations with explicit implementation boundaries.",
  alternates: {
    canonical: "https://quickvoice.co/use-cases",
  },
  openGraph: {
    title: "AI Voice Agent Use Cases",
    description:
      "Explore how QuickVoice can be adapted for support, scheduling, sales, collections, and other bounded phone workflows.",
    type: "website",
    url: "https://quickvoice.co/use-cases",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agent Use Cases",
    description:
      "Explore how QuickVoice can be adapted for support, scheduling, sales, collections, and other bounded phone workflows.",
    images: ["/og-image.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "AI Voice Agent Use Cases | QuickVoice",
  description:
    "Discover how QuickVoice's AI-powered voice agents automate workflows, enhance customer experiences, and drive operational efficiency across customer support, sales, scheduling, and more.",
  url: "https://quickvoice.co/use-cases",
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
        name: "Use Cases",
        item: "https://quickvoice.co/use-cases",
      },
    ],
  },
};

export default function UseCasesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <UseCasesHeroSection />
      <UseCasesGridSection />
      <UseCasesCtaSection />
    </div>
  );
}
