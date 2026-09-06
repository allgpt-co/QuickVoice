import type { Metadata } from "next";

import { PRICING_FAQS, UsagePricing } from "@/components/pricing/usage-pricing";

export const metadata: Metadata = {
  title: "Usage-based AI Voice Agent Pricing",
  description:
    "Understand measured AI and telephony costs plus a $0.01 connected-minute platform fee. Phone numbers start at $2 per 30 days; signup credits are subject to eligibility.",
  alternates: {
    canonical: "https://quickvoice.co/pricing",
  },
  openGraph: {
    title: "Usage-based AI Voice Agent Pricing",
    description:
      "A prepaid wallet for measured AI, telephony, and connected-time usage. Review the cost formula, number rental, and conditional signup credit.",
    type: "website",
    url: "https://quickvoice.co/pricing",
    images: [
      { url: "https://quickvoice.co/og-image.png", width: 1200, height: 630 },
    ],
  },
};

const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QuickVoice",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://quickvoice.co/pricing",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: PRICING_FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.a,
    },
  })),
};

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <UsagePricing />
    </>
  );
}
