import { Metadata } from "next";
import {
  CareersHeroSection,
  CareersValuesSection,
  CareersJobOpportunitiesSection,
  CareersBenefitsSection,
  CareersIndustriesSection,
  CareersCultureSection,
  CareersFaqSection,
  CareersSocialSection,
  CareersCtaSection,
} from "@/components/landing/careers";

export const metadata: Metadata = {
  title: "Careers — Join the AI Voice Revolution",
  description:
    "Join QuickVoice and help build the future of AI voice agents. Explore open positions in engineering, sales, and more.",
  keywords:
    "QuickVoice careers, AI voice agent jobs, voice technology careers, AI-powered voice agents, tech careers, AI innovation jobs, voice automation careers, AI voice agent revolution, tech company jobs, AI technology careers",
  authors: [{ name: "QuickVoice Team" }],
  creator: "QuickVoice",
  publisher: "QuickVoice",
  robots: "index, follow",
  openGraph: {
    title: "Careers at QuickVoice — Build the Future of Voice AI",
    description:
      "Join QuickVoice and help build the future of AI voice agents. Explore open positions in engineering, sales, and more.",
    type: "website",
    url: "https://quickvoice.co/company/careers",
    siteName: "QuickVoice",
    images: [
      {
        url: "/images/analytics-dashboard.png",
        width: 1200,
        height: 630,
        alt: "QuickVoice AI-powered voice agent careers and opportunities",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Careers at QuickVoice — Build the Future of Voice AI",
    description:
      "Join QuickVoice and help build the future of AI voice agents. Explore open positions in engineering, sales, and more.",
    images: ["/images/analytics-dashboard.png"],
  },
  alternates: {
    canonical: "https://quickvoice.co/company/careers",
  },
};

export default function CareersPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QuickVoice",
    description:
      "AI-powered customer service automation provider empowering businesses with intelligent voice agents",
    url: "https://quickvoice.co",
    logo: "https://quickvoice.co/logo.svg",
    foundingDate: "2020",
    founder: {
      "@type": "Person",
      name: "Rahul Agarwal",
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "US",
    },
    sameAs: [
      "https://www.linkedin.com/company/quickvoice",
      "https://twitter.com/quickvoice",
    ],
    service: [
      {
        "@type": "Service",
        name: "AI-Powered Voice Automation",
        description: "Intelligent voice agents for customer service automation",
      },
    ],
    industry: "Customer Service Automation",
    numberOfEmployees: "80+",
    hasJobPosting: {
      "@type": "JobPosting",
      title: "AI Voice Agent Developer",
      description: "Join our team to develop cutting-edge AI voice agents",
      employmentType: "FULL_TIME",
      hiringOrganization: {
        "@type": "Organization",
        name: "QuickVoice",
      },
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <CareersHeroSection />
      <CareersValuesSection />
      <CareersJobOpportunitiesSection />
      <CareersBenefitsSection />
      <CareersIndustriesSection />
      <CareersCultureSection />
      <CareersFaqSection />
      <CareersSocialSection />
      <CareersCtaSection />
    </div>
  );
}
