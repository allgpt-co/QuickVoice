import type { Metadata } from "next";
import dynamic from "next/dynamic";

// Above-fold: server-rendered immediately (SSR)
import { HeroSection } from "@/components/landing/hero-section";

// Below-fold: lazy-loaded to reduce initial JS parse
const FeaturesSection = dynamic(() =>
  import("@/components/landing/features-section").then((m) => ({
    default: m.FeaturesSection,
  })),
);
const AboutSection = dynamic(() =>
  import("@/components/landing/about-section").then((m) => ({
    default: m.AboutSection,
  })),
);
const CtaSection = dynamic(() =>
  import("@/components/landing/cta-section").then((m) => ({
    default: m.CtaSection,
  })),
);
const FaqSection = dynamic(() =>
  import("@/components/landing/faq-section").then((m) => ({
    default: m.FaqSection,
  })),
);
const ContactSection = dynamic(() =>
  import("@/components/landing/contact-section").then((m) => ({
    default: m.ContactSection,
  })),
);

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
  mainEntity: [
    {
      "@type": "Question",
      name: "What is QuickVoice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "QuickVoice is open-source, self-hostable infrastructure for AI phone agents. It includes the web app, console, API, LiveKit worker, telephony integration points, knowledge bases, call logs, campaigns, billing paths, and local development tooling.",
      },
    },
    {
      "@type": "Question",
      name: "How is QuickVoice different from hosted voice-agent APIs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Hosted voice-agent APIs optimize for managed convenience. QuickVoice focuses on control: teams can inspect the source, self-host the stack, review privacy-sensitive data paths, choose providers, and extend workflows.",
      },
    },
    {
      "@type": "Question",
      name: "Can I run QuickVoice locally?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The primary local path is task up:dev. It starts the local product surface and services for inspection and development.",
      },
    },
    {
      "@type": "Question",
      name: "Can a fresh clone place real phone calls?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Real phone calls require LiveKit plus Twilio or Telnyx credentials. OAuth, billing, email, and object storage also require their own provider keys.",
      },
    },
    {
      "@type": "Question",
      name: "Is QuickVoice a Retell alternative?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "QuickVoice is positioned as an open-source Retell alternative for teams that want source-level control, self-hosting, privacy review, cost visibility, and extensibility instead of only using a closed hosted API.",
      },
    },
    {
      "@type": "Question",
      name: "Does the repository alone prove compliance?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Compliance depends on deployment, access controls, provider agreements, data retention, operations, and legal review. The open-source repo makes the technical paths inspectable, but it is not a standalone compliance claim.",
      },
    },
    {
      "@type": "Question",
      name: "Can I customize QuickVoice?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The MIT-licensed repo is designed to be inspected and extended, including agents, knowledge sources, campaigns, permissions, billing paths, provider integrations, and deployment choices.",
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <main className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <HeroSection />
        <FeaturesSection />
        <AboutSection />
        <CtaSection />
        <FaqSection />
        <ContactSection />
      </main>
    </>
  );
}
