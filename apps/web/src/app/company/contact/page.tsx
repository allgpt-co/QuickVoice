import { Metadata } from "next";
import {
  ContactUsHeroSection,
  ContactUsFormSection,
  ContactUsFaqSection,
} from "@/components/landing/contact-us";

export const metadata: Metadata = {
  title: "Contact QuickVoice — Book a Demo or Send an Enquiry",
  description:
    "Book a QuickVoice demo or contact the team about pricing, implementation, and support for your calling workflow.",
  keywords:
    "contact QuickVoice, voice technology support, AI voice agents contact, business consultation, voice automation support",
  authors: [{ name: "QuickVoice Team" }],
  creator: "QuickVoice",
  publisher: "QuickVoice",
  robots: "index, follow",
  openGraph: {
    title: "Contact QuickVoice",
    description:
      "Book a demo or send the QuickVoice team an enquiry about your calling workflow.",
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
    title: "Contact QuickVoice",
    description:
      "Book a demo or send the QuickVoice team an enquiry about your calling workflow.",
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
      "Book a demo or contact the QuickVoice team about your calling workflow.",
    url: "https://quickvoice.co/company/contact",
    mainEntity: {
      "@type": "Organization",
      name: "QuickVoice",
      description: "Voice agent software for business calling workflows",
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
      <ContactUsFaqSection />
    </div>
  );
}
