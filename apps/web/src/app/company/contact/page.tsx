import { Metadata } from "next";
import {
  ContactUsHeroSection,
  ContactUsFormSection,
  ContactUsWhySection,
  ContactUsFaqSection,
} from "@/components/landing/contact-us";

export const metadata: Metadata = {
  title: "Contact QuickVoice — Get a Demo or Support",
  description:
    "Contact QuickVoice for a demo, pricing, or support. Reach our team to learn how AI voice agents can automate your business calls.",
  keywords:
    "contact QuickVoice, voice technology support, AI voice agents contact, business consultation, voice automation support",
  authors: [{ name: "QuickVoice Team" }],
  creator: "QuickVoice",
  publisher: "QuickVoice",
  robots: "index, follow",
  openGraph: {
    title: "Contact Us",
    description:
      "Get in touch with QuickVoice to explore how voice agents can transform your business. Contact our team today for more information.",
    type: "website",
    url: "https://quickvoice.co/company/contact",
    siteName: "QuickVoice",
    images: [
      {
        url: "/images/analytics-dashboard.png",
        width: 1200,
        height: 630,
        alt: "QuickVoice AI-powered voice automation contact page",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Us",
    description:
      "Get in touch with QuickVoice to explore how voice agents can transform your business. Contact our team today for more information.",
    images: ["/images/analytics-dashboard.png"],
  },
  alternates: {
    canonical: "https://quickvoice.co/company/contact",
  },
};

export default function ContactUsPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact Us - QuickVoice",
    description:
      "Get in touch with QuickVoice to explore how voice agents can transform your business",
    url: "https://quickvoice.co/company/contact",
    mainEntity: {
      "@type": "Organization",
      name: "QuickVoice",
      description:
        "AI-powered voice automation provider empowering businesses with intelligent voice agents",
      url: "https://quickvoice.co",
      logo: "https://quickvoice.co/logo.svg",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        url: "https://quickvoice.co/company/contact",
      },
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ContactUsHeroSection />
      <ContactUsFormSection />
      <ContactUsWhySection />
      <ContactUsFaqSection />
    </div>
  );
}
