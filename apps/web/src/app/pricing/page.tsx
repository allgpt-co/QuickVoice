import type { Metadata } from "next";

import {
  PRICING_FAQS,
  UsagePricing,
} from "@/components/pricing/usage-pricing";

export const metadata: Metadata = {
  title: "Usage-based AI Voice Agent Pricing",
  description:
    "Start with $5 in free call credit. Pay measured AI and telephony costs plus a $0.01 connected-minute platform fee; phone numbers start at $2 per 30 days.",
  alternates: {
    canonical: "https://quickvoice.co/pricing",
  },
  openGraph: {
    title: "Usage-based AI Voice Agent Pricing",
    description:
      "A prepaid wallet for measured AI, telephony, and connected-time usage, with $5 in signup call credit.",
    type: "website",
    url: "https://quickvoice.co/pricing",
  },
};

const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QuickVoice",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://quickvoice.co/pricing",
  offers: {
    "@type": "Offer",
    name: "QuickVoice prepaid usage",
    price: "0",
    priceCurrency: "USD",
    description:
      "$5 promotional call credit for newly verified users, then prepaid usage-based billing.",
  },
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
