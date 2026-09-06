import type { Metadata } from "next";
import { BusinessHome, buyerFaqs } from "@/components/landing/business-home";

export const metadata: Metadata = {
  title: "AI Phone Agents for Business Calls",
  description:
    "Explore AI phone agents for reception, appointment requests, customer support, and sales follow-up on QuickVoice's self-hostable platform.",
  alternates: { canonical: "https://quickvoice.co" },
  openGraph: {
    title: "AI Phone Agents for Business Calls | QuickVoice",
    description:
      "Plan a focused business calling workflow with clear implementation and human follow-up requirements.",
    url: "https://quickvoice.co",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Phone Agents for Business Calls",
    description:
      "Evaluate reception, scheduling, support, and sales workflows with QuickVoice.",
    images: ["/og-image.png"],
  },
};

const homepageSchema = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://quickvoice.co/#website",
    name: "QuickVoice",
    url: "https://quickvoice.co",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://quickvoice.co/blog?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://quickvoice.co/#organization",
    name: "QuickVoice",
    alternateName: [
      "QuickVoice AI",
      "QuickVoice.co",
      "QuickVoice AI Phone Agent Stack",
    ],
    url: "https://quickvoice.co",
    logo: {
      "@type": "ImageObject",
      url: "https://quickvoice.co/logo.svg",
      width: 512,
      height: 512,
    },
    description:
      "Open-source, self-hostable AI phone-agent infrastructure for teams that want to run, inspect, and extend the voice-agent stack.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      url: "https://quickvoice.co/company/contact",
    },
    sameAs: ["https://github.com/allgpt-co/QuickVoice"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "QuickVoice",
    description:
      "Self-hostable AI phone-agent stack with a console, API, LiveKit worker, telephony integrations, knowledge bases, campaigns, call logs, and billing paths.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript. Requires HTML5.",
    url: "https://quickvoice.co",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: buyerFaqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homepageSchema).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c"),
        }}
      />
      <BusinessHome />
    </>
  );
}
